import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const jwtVerify = vi.fn();
vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: (...a: unknown[]) => jwtVerify(...a),
}));

const query = vi.fn();
const release = vi.fn();
// `connect` is its own mock (not just an inline async fn) so individual tests can override the
// checkout itself — e.g. to leave it pending past the timeout (P6-review MAJOR).
const connect = vi.fn(async () => ({ query: (...a: unknown[]) => query(...a), release }));
// isRevoked runs its SELECT through a pooled client (BEGIN/SET LOCAL/SELECT/COMMIT) so
// `SET LOCAL statement_timeout` scopes to just that query (P3-review MAJOR-2) — route all of
// client.query through the same `query` mock so existing assertions on the SELECT call still work.
vi.mock('./db', () => ({
  getPool: () => ({
    query: (...a: unknown[]) => query(...a),
    connect: (...a: unknown[]) => connect(...(a as [])),
  }),
}));

const NOW = 1_700_000_000; // arbitrary fixed epoch seconds for iat/revoked_at comparisons

beforeEach(() => {
  jwtVerify.mockReset();
  query.mockReset();
  release.mockReset();
  connect.mockReset();
  connect.mockImplementation(async () => ({ query: (...a: unknown[]) => query(...a), release }));
  query.mockResolvedValue({ rows: [] }); // default: no revocation row → not revoked
  process.env.COGNITO_USER_POOL_ID = 'ap-northeast-2_TEST';
  process.env.COGNITO_CLIENT_ID = 'client123';
  process.env.AWS_REGION = 'ap-northeast-2';
  // pentest-remediation P5-review: revokeSessionsFor debounces repeat writes for the same
  // (sub, iat) in a module-level Map so it survives across requests within one running process —
  // but that same persistence leaks across test cases in this file, several of which intentionally
  // reuse the shared `NOW` constant as an iat. Reset the module registry so each test imports a
  // fresh `./auth` with an empty debounce map, matching a cold container rather than a warm one
  // that's already seen an identical (sub, iat) pair from an earlier, unrelated test.
  vi.resetModules();
});

describe('verifyUser', () => {
  it('returns null when no cookie', async () => {
    const { verifyUser } = await import('./auth');
    expect(await verifyUser(null)).toBeNull();
  });
  it('returns null when awsops_token cookie absent', async () => {
    const { verifyUser } = await import('./auth');
    expect(await verifyUser('foo=bar; baz=1')).toBeNull();
  });
  it('returns {sub,email} for a valid id token with a VERIFIED email', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', email: 'a@b.com', email_verified: true, token_use: 'id', iat: NOW } });
    const { verifyUser } = await import('./auth');
    expect(await verifyUser('awsops_token=eyJ...; x=1')).toEqual({ sub: 'u-1', email: 'a@b.com', groups: [] });
  });
  // PR #203 review MAJOR (2 models): the legacy ownership branch authorizes reads — and PATCH/DELETE
  // via canMutateReport — on this claim, and Cognito lets a user change their own email. Adopting an
  // UNVERIFIED address made the exposure self-service: set your email to a departed colleague's and
  // inherit their legacy rows. The user stays authenticated; they just lose the legacy email match.
  it('drops an UNVERIFIED email claim but keeps the session', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', email: 'victim@b.com', email_verified: false, token_use: 'id', iat: NOW } });
    const { verifyUser } = await import('./auth');
    expect(await verifyUser('awsops_token=eyJ...')).toEqual({ sub: 'u-1', email: undefined, groups: [] });
  });
  it('drops an email claim with no email_verified at all (absent !== verified)', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', email: 'victim@b.com', token_use: 'id', iat: NOW } });
    const { verifyUser } = await import('./auth');
    expect(await verifyUser('awsops_token=eyJ...')).toEqual({ sub: 'u-1', email: undefined, groups: [] });
  });
  it('does not accept the string "true" as verified', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', email: 'victim@b.com', email_verified: 'true', token_use: 'id', iat: NOW } });
    const { verifyUser } = await import('./auth');
    expect((await verifyUser('awsops_token=eyJ...'))?.email).toBeUndefined();
  });
  it('returns null when token_use is not id', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'access', iat: NOW } });
    const { verifyUser } = await import('./auth');
    expect(await verifyUser('awsops_token=eyJ...')).toBeNull();
  });
  it('returns null when verification throws (expired/forged)', async () => {
    jwtVerify.mockRejectedValue(new Error('expired'));
    const { verifyUser } = await import('./auth');
    expect(await verifyUser('awsops_token=eyJ...')).toBeNull();
  });

  // pentest-remediation P1-1 (Finding 1): server-side revocation-on-logout.
  describe('revocation', () => {
    it('rejects a token issued before (or at) the revocation cutoff', async () => {
      jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
      query.mockResolvedValue({ rows: [{ revoked_at: new Date((NOW + 1) * 1000).toISOString() }] });
      const { verifyUser } = await import('./auth');
      expect(await verifyUser('awsops_token=eyJ...')).toBeNull();
    });
    // pentest-remediation P3-review (CRITICAL): revokeSessionsFor stamps revoked_at to the
    // signing-out token's OWN iat. If isRevoked used strict `<`, that exact token's own
    // post-logout check would evaluate `iat < iat` -> false ("not revoked") and stay valid for its
    // full remaining lifetime — defeating the entire point of this PR (the leaked token used to
    // log out is never actually revoked). This is the missing equality case: iat === revoked_at.
    it('rejects a token whose iat exactly EQUALS the revocation cutoff (the signout token itself)', async () => {
      jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
      query.mockResolvedValue({ rows: [{ revoked_at: new Date(NOW * 1000).toISOString() }] });
      const { verifyUser } = await import('./auth');
      expect(await verifyUser('awsops_token=eyJ...')).toBeNull();
    });
    it('accepts a token issued AFTER the revocation cutoff (re-login post-logout)', async () => {
      jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
      query.mockResolvedValue({ rows: [{ revoked_at: new Date((NOW - 1) * 1000).toISOString() }] });
      const { verifyUser } = await import('./auth');
      expect(await verifyUser('awsops_token=eyJ...')).not.toBeNull();
    });
    it('rejects a token with no iat claim (fail closed on a malformed/unexpected shape)', async () => {
      jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id' } });
      const { verifyUser } = await import('./auth');
      expect(await verifyUser('awsops_token=eyJ...')).toBeNull();
    });
    it('fails OPEN (does not block login) when the revocation-check DB query throws', async () => {
      jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
      query.mockRejectedValue(new Error('db down'));
      const { verifyUser } = await import('./auth');
      expect(await verifyUser('awsops_token=eyJ...')).not.toBeNull();
    });
    it('queries session_revocations scoped to the token sub', async () => {
      jwtVerify.mockResolvedValue({ payload: { sub: 'u-42', token_use: 'id', iat: NOW } });
      const { verifyUser } = await import('./auth');
      await verifyUser('awsops_token=eyJ...');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('session_revocations'), ['u-42']);
    });
  });
});

describe('revokeSessionsFor', () => {
  it('upserts a revocation row bound to the given iat', async () => {
    const { revokeSessionsFor } = await import('./auth');
    await revokeSessionsFor('u-1', NOW);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (user_sub) DO UPDATE'), ['u-1', NOW]);
  });

  // pentest-remediation P5-review (MAJOR M3): /api/auth/signout is public with no rate limit —
  // replaying the identical captured token in a tight loop would otherwise drive one DB round-trip
  // per call, and enough concurrent hung round-trips exhaust the `max: 3` pool and take
  // isRevoked() (and thus every authenticated request) down with it via fail-open. The exact-same
  // (sub, iat) pair is a costless no-op at the database anyway (WHERE guard), so skip the
  // round-trip entirely for repeats within the debounce window — this must not touch the query
  // mock a second time.
  it('debounces an immediate replay of the exact same (sub, iat) — does not hit the DB again', async () => {
    const { revokeSessionsFor } = await import('./auth');
    await revokeSessionsFor('u-1', NOW);
    const callsAfterFirst = query.mock.calls.length;
    await revokeSessionsFor('u-1', NOW); // identical replay, well within the debounce window
    expect(query.mock.calls.length).toBe(callsAfterFirst); // no additional query calls at all
  });

  // A genuinely different iat from the same sub (a fresh, later signout) must NOT be swallowed by
  // the same-token debounce above — only the exact-token replay is a no-op.
  it('does not debounce a different iat from the same sub', async () => {
    const { revokeSessionsFor } = await import('./auth');
    await revokeSessionsFor('u-1', NOW);
    const callsAfterFirst = query.mock.calls.length;
    await revokeSessionsFor('u-1', NOW + 1);
    expect(query.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  // pentest-remediation P2-review (MAJOR-1): replaying an already-revoked (but unexpired) token
  // against signout must not be able to push the cutoff past that token's own iat — otherwise a
  // captured, already-logged-out token can be replayed forever to roll-DoS every session the
  // victim creates afterward. Exercised at the SQL/param level since query is mocked (matches
  // this file's existing style for revokeSessionsFor/isRevoked).
  it('bounds the cutoff to the WHERE-guarded upsert so a replay with an older iat cannot re-advance a newer cutoff', async () => {
    const { revokeSessionsFor } = await import('./auth');
    // First call: a normal fresh logout, iat = NOW.
    await revokeSessionsFor('u-1', NOW);
    // "Replay" call: an attacker resubmits an older, already-revoked token (iat = NOW - 100).
    await revokeSessionsFor('u-1', NOW - 100);
    // The write now runs inside a BEGIN/SET LOCAL/.../COMMIT transaction (P4-review MAJOR, same
    // protection as isRevoked below), so the last `query` call is COMMIT, not the UPSERT — find
    // the last call that actually contains the UPSERT instead of assuming it's the tail call.
    const upsertCall = query.mock.calls.filter(([sql]) => String(sql).includes('ON CONFLICT')).at(-1) as [
      string,
      [string, number],
    ];
    const [sql, params] = upsertCall;
    // The guard clause must be present and parameterized on the *replayed* call's own iat, so
    // Postgres — not this test — is what actually prevents the cutoff from moving backward: the
    // WHERE clause only lets the update through if the new cutoff is later than what's stored.
    expect(sql).toContain('WHERE session_revocations.revoked_at < to_timestamp($2)');
    expect(params).toEqual(['u-1', NOW - 100]);
  });

  // pentest-remediation P4-review (MAJOR): the READ path (isRevoked) got a statement_timeout +
  // client-side race in round 3; the WRITE path did not, leaving a hung UPSERT free to hold a
  // connection out of the `max: 3` pool forever. Both now go through the same withStatementTimeout
  // helper, so a hung write must degrade the same way a hung read does: reject, not hang forever.
  it('fails (does not hang forever) when the revocation write query hangs past the timeout', async () => {
    vi.useFakeTimers();
    query.mockReturnValue(new Promise(() => {})); // never resolves — simulate a hung DB write
    const { revokeSessionsFor } = await import('./auth');
    const p = revokeSessionsFor('u-1', NOW);
    const assertion = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(3100);
    await assertion;
    vi.useRealTimers();
  });
});

describe('verifyUserForSignout', () => {
  it('returns null when no cookie', async () => {
    const { verifyUserForSignout } = await import('./auth');
    expect(await verifyUserForSignout(null)).toBeNull();
  });
  it('accepts a token jwtVerify would reject for a fresh verifyUser call ONLY because it is expired', async () => {
    // Simulate: the mocked jwtVerify call succeeds because we pass clockTolerance — we can't
    // actually exercise jose's real expiry math against a mock, so this asserts the call site
    // wires clockTolerance through (the behavior jose then enforces).
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
    const { verifyUserForSignout } = await import('./auth');
    const user = await verifyUserForSignout('awsops_token=eyJ...');
    expect(user).toEqual({ sub: 'u-1', iat: NOW });
    const [, , opts] = jwtVerify.mock.calls.at(-1) as [unknown, unknown, { clockTolerance?: unknown }];
    expect(opts.clockTolerance).toBeTruthy();
  });
  it('still rejects on signature/issuer/audience failure (cannot be forged)', async () => {
    jwtVerify.mockRejectedValue(new Error('signature verification failed'));
    const { verifyUserForSignout } = await import('./auth');
    expect(await verifyUserForSignout('awsops_token=eyJ...')).toBeNull();
  });
  it('rejects a non-id token_use', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'access', iat: NOW } });
    const { verifyUserForSignout } = await import('./auth');
    expect(await verifyUserForSignout('awsops_token=eyJ...')).toBeNull();
  });
  // MAJOR-1 needs iat to bound revokeSessionsFor's cutoff — a token without one can't be
  // safely revoked-with-a-bound, so treat it like the other malformed-shape rejections.
  it('rejects a token with no iat claim (nothing to bound the revocation cutoff to)', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id' } });
    const { verifyUserForSignout } = await import('./auth');
    expect(await verifyUserForSignout('awsops_token=eyJ...')).toBeNull();
  });
  it('does NOT check revocation (signout must work even for an already-revoked/expired session)', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
    const { verifyUserForSignout } = await import('./auth');
    await verifyUserForSignout('awsops_token=eyJ...');
    expect(query).not.toHaveBeenCalled();
  });
  // pentest-remediation P1-review (MAJOR-1): clockTolerance must be short (minutes), not the
  // original 10-year value — otherwise anyone holding a long-expired token can replay it against
  // signout forever to keep force-logging-out the victim's *current* valid sessions.
  it('uses a short (minutes-scale) clockTolerance, not a multi-year one (logout-replay DoS)', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
    const { verifyUserForSignout } = await import('./auth');
    await verifyUserForSignout('awsops_token=eyJ...');
    const [, , opts] = jwtVerify.mock.calls.at(-1) as [unknown, unknown, { clockTolerance?: string }];
    expect(opts.clockTolerance).toMatch(/minute/);
  });
  it('rejects (via jose) a token expired well beyond the tolerance window', async () => {
    // jose itself enforces clockTolerance against real exp math; simulate that rejection here
    // since jwtVerify is mocked — this documents the boundary the real library enforces.
    jwtVerify.mockRejectedValue(new Error('"exp" claim timestamp check failed'));
    const { verifyUserForSignout } = await import('./auth');
    expect(await verifyUserForSignout('awsops_token=eyJ...')).toBeNull();
  });
});

// pentest-remediation P7-review (MAJOR 1): the revocation check used to cost a dedicated pool
// checkout + 4 round-trips on EVERY authenticated request, against a pool of `max: 3` — mutual
// starvation with the app's data queries. Now cached per sub for a few seconds (safe because the
// cutoff only ever advances, so staleness is bounded and only ever permissive).
describe('revocation-cutoff cache', () => {
  const selects = () => query.mock.calls.filter(([sql]) => String(sql).includes('SELECT revoked_at')).length;

  it('issues only ONE query for two consecutive checks of the same sub within the TTL', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
    const { verifyUser } = await import('./auth');
    await verifyUser('awsops_token=eyJ...');
    expect(selects()).toBe(1);
    await verifyUser('awsops_token=eyJ...');
    expect(selects()).toBe(1); // served from cache — no second round-trip
  });

  it('does NOT cache a fail-open result — the next check retries the DB', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
    query.mockRejectedValueOnce(new Error('db down'));
    const { verifyUser } = await import('./auth');
    expect(await verifyUser('awsops_token=eyJ...')).not.toBeNull(); // failed open
    query.mockResolvedValue({ rows: [{ revoked_at: new Date((NOW + 1) * 1000).toISOString() }] });
    // A transient blip must not disable revocation for the whole TTL: this must hit the DB again
    // and see the real (revoking) cutoff.
    expect(await verifyUser('awsops_token=eyJ...')).toBeNull();
  });

  it('is invalidated by revokeSessionsFor so the sub\'s own logout takes effect immediately', async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
    const { verifyUser, revokeSessionsFor } = await import('./auth');
    expect(await verifyUser('awsops_token=eyJ...')).not.toBeNull(); // caches "no revocation row"
    await revokeSessionsFor('u-1', NOW);
    query.mockResolvedValue({ rows: [{ revoked_at: new Date(NOW * 1000).toISOString() }] });
    expect(await verifyUser('awsops_token=eyJ...')).toBeNull(); // not the stale cached miss
  });
});

describe('isRevoked timeout (via verifyUser)', () => {
  it('fails open when the revocation-check query hangs past the timeout', async () => {
    vi.useFakeTimers();
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
    query.mockReturnValue(new Promise(() => {})); // never resolves — simulate a hung DB query
    const { verifyUser } = await import('./auth');
    const p = verifyUser('awsops_token=eyJ...');
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).not.toBeNull();
    vi.useRealTimers();
  });

  // pentest-remediation P6-review (MAJOR): the case above hangs AFTER checkout, which the timer
  // handles by destroying the connection. The nastier case is a hang while still WAITING for a
  // connection — under pool saturation the 3s timer always beats db.ts's 5s
  // connectionTimeoutMillis, so this is the DEFAULT path when the pool is full. A late-arriving
  // connection must be handed straight back with no queries run on it, or the abandoned work keeps
  // the `max: 3` pool starved and turns load-shedding into positive feedback.
  it('runs no queries on a connection acquired after the timeout already fired', async () => {
    vi.useFakeTimers();
    jwtVerify.mockResolvedValue({ payload: { sub: 'u-1', token_use: 'id', iat: NOW } });
    let releaseLateClient: ((c: { query: unknown; release: unknown }) => void) | undefined;
    const lateRelease = vi.fn();
    connect.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseLateClient = resolve as typeof releaseLateClient;
      }),
    );
    const { verifyUser } = await import('./auth');
    const p = verifyUser('awsops_token=eyJ...');
    await vi.advanceTimersByTimeAsync(3100); // timer fires while connect() is still pending
    const callsBeforeLateArrival = query.mock.calls.length;
    // Now the pool finally hands us a connection, well after we gave up on it.
    releaseLateClient!({ query: (...a: unknown[]) => query(...a), release: lateRelease });
    expect(await p).not.toBeNull(); // still failed open, as before
    // The whole point: no BEGIN / SET LOCAL / SELECT / COMMIT was issued on the late connection...
    expect(query.mock.calls.length).toBe(callsBeforeLateArrival);
    // ...and it went straight back to the pool instead of being held.
    expect(lateRelease).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// PR #195 round-4 review MAJOR #1: matchesIdentity() is the legacy-row escape hatch — a report/job
// row written before the identity() switch (raw sub) must still resolve for its owner even after
// their token starts carrying an email that makes identity() diverge from sub.
describe('matchesIdentity', () => {
  it('matches a row keyed by identity() (email)', async () => {
    const { matchesIdentity } = await import('./auth');
    expect(matchesIdentity('u@x.io', { sub: 'u', email: 'u@x.io' })).toBe(true);
  });
  it('matches a legacy row keyed by the raw sub even when identity() now differs', async () => {
    const { matchesIdentity } = await import('./auth');
    expect(matchesIdentity('u', { sub: 'u', email: 'u@x.io' })).toBe(true);
  });
  it('does not match a different user’s row', async () => {
    const { matchesIdentity } = await import('./auth');
    expect(matchesIdentity('other@x.io', { sub: 'u', email: 'u@x.io' })).toBe(false);
  });
  it('fails closed on a null/empty owner', async () => {
    const { matchesIdentity } = await import('./auth');
    expect(matchesIdentity(null, { sub: 'u', email: 'u@x.io' })).toBe(false);
    expect(matchesIdentity('', { sub: 'u', email: 'u@x.io' })).toBe(false);
  });
});

// PR #195 review MAJOR: matchesIdentity() used to accept the email form unconditionally, so a
// reassigned Cognito address let a new sub read the previous owner's legacy rows with no way to close
// the window. These pin the flag in both states.
describe('legacy email ownership match is gated and removable', () => {
  const user = { sub: 'sub-1', email: 'a@x.io', groups: [] };
  const original = process.env.LEGACY_EMAIL_OWNER_MATCH;
  afterEach(() => {
    if (original === undefined) delete process.env.LEGACY_EMAIL_OWNER_MATCH;
    else process.env.LEGACY_EMAIL_OWNER_MATCH = original;
  });

  it('matches a legacy email-keyed row while the flag is on (default)', async () => {
    delete process.env.LEGACY_EMAIL_OWNER_MATCH;
    const { matchesIdentity } = await import('@/lib/auth');
    expect(matchesIdentity('a@x.io', user)).toBe(true);
    expect(matchesIdentity('sub-1', user)).toBe(true);
  });

  it('stops matching the email form once the flag is off — sub only', async () => {
    process.env.LEGACY_EMAIL_OWNER_MATCH = 'false';
    const { matchesIdentity } = await import('@/lib/auth');
    expect(matchesIdentity('a@x.io', user)).toBe(false);
    expect(matchesIdentity('sub-1', user)).toBe(true);
  });

  it('ownerKeysForRead mirrors matchesIdentity exactly in both flag states', async () => {
    const { ownerKeysForRead } = await import('@/lib/auth');
    delete process.env.LEGACY_EMAIL_OWNER_MATCH;
    expect(ownerKeysForRead(user)).toEqual(['a@x.io', 'sub-1']);
    process.env.LEGACY_EMAIL_OWNER_MATCH = 'false';
    expect(ownerKeysForRead(user)).toEqual(['sub-1']);
    expect(ownerKeysForRead({ sub: 'sub-2', groups: [] })).toEqual(['sub-2']);
  });
});
