import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { PoolClient } from 'pg';
import { getPool } from './db';

export interface User {
  sub: string;
  email?: string;
  groups?: string[];
  iat?: number;
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const region = process.env.AWS_REGION || 'ap-northeast-2';
    const pool = process.env.COGNITO_USER_POOL_ID;
    jwks = createRemoteJWKSet(
      new URL(`https://cognito-idp.${region}.amazonaws.com/${pool}/.well-known/jwks.json`),
    );
  }
  return jwks;
}

// pentest-remediation P1-1 (Finding 1): Cognito's id_token has no server-side revocation
// (GlobalSignOut only reaches refresh/access tokens), so logout was purely a client-side cookie
// clear — a captured pre-logout token stayed valid for its full remaining ~12h. This is our own
// revocation store: one row per user (sub), stamped by signout() below. Fails OPEN on a DB error —
// a transient Aurora blip must not log every user in the app out; it just means revocation isn't
// enforced during that window, which is the pre-fix status quo, not a new failure domain.
// pentest-remediation P1-review (MAJOR-3): every authenticated request now costs an Aurora
// round-trip. A hung query (cold-start ACU scaling, exhausted `max: 3` pool) would previously
// stall forever — a rejected promise fails open via the catch below, but a promise that never
// settles doesn't. Race it against a short timer so "hung" degrades the same way "errored" does.
const REVOCATION_CHECK_TIMEOUT_MS = 3000;

// pentest-remediation P3-review (MAJOR-2): Promise.race above only stops *us* from waiting on a
// hung query — the query itself keeps running server-side and keeps holding its connection out of
// the `max: 3` pool. 3 concurrent hangs (e.g. an Aurora Serverless v2 scaling event) would then
// starve the whole app's pool, not just auth. `SET LOCAL statement_timeout` makes Postgres itself
// cancel the statement, freeing the connection. Scoped to this one query via a throwaway
// transaction (`SET LOCAL` reverts at COMMIT/ROLLBACK) so it never leaks onto other queries that
// share this same pooled connection afterward — a pool-wide `options: '-c statement_timeout=...'`
// would also throttle unrelated longer-running queries elsewhere in the app.
// pentest-remediation P4-review (MAJOR): this used to be READ-path-only (queryRevocation), leaving
// the WRITE path (revokeSessionsFor) with a raw, un-timeout-bounded pool.query — a hung UPSERT
// could hold a connection forever, and since /api/auth/signout is a PUBLIC route with only
// `max: 3` connections in the pool, a handful of concurrent hung signouts could exhaust the pool
// and take isRevoked() (and thus every authenticated request) down with it. Both callers now share
// this one helper so they can never drift apart again.
if (!Number.isInteger(REVOCATION_CHECK_TIMEOUT_MS)) {
  // `SET LOCAL statement_timeout = ${...}` is string-interpolated (SET LOCAL can't take a bound
  // parameter), so this constant must stay a literal integer — guard against it silently becoming
  // an injection point if it's ever moved to an env var.
  throw new Error('REVOCATION_CHECK_TIMEOUT_MS must be an integer');
}

type TimeoutRaceState = { client: PoolClient | null; released: boolean; cancelled: boolean };

async function runInTimeoutScopedTransaction<T>(
  runQuery: (client: PoolClient) => Promise<T>,
  state: TimeoutRaceState,
): Promise<T> {
  const client = await getPool().connect();
  state.client = client;
  // pentest-remediation P6-review (MAJOR): the timer may have fired while we were still waiting on
  // connect() — at that point `state.client` was still null, so the timer had no connection to
  // destroy and could only set `cancelled`. Without this check we'd go on to spend a full
  // BEGIN/SET LOCAL/query/COMMIT round-trip on a connection nobody is waiting for any more. That's
  // the pathological case under pool saturation: the 3s timer beats db.ts's 5s
  // connectionTimeoutMillis, so EVERY saturated request would take this path and the abandoned
  // work would keep the `max: 3` pool starved — load-shedding inverted into positive feedback,
  // silently disabling revocation app-wide via isRevoked's fail-open. Hand the connection straight
  // back instead and do no work on it.
  if (state.cancelled) {
    if (!state.released) {
      state.released = true;
      client.release();
    }
    throw new Error('revocation query cancelled before it acquired a connection');
  }
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${REVOCATION_CHECK_TIMEOUT_MS}`);
    const result = await runQuery(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {}); // best-effort — connection may already be dead
    throw e;
  } finally {
    // pentest-remediation P5-review (MAJOR M2): if the timer below already destroyed this
    // connection (we lost the race), don't also call the normal release() path here — `state`
    // is shared so whichever side settles first "wins" the connection's disposition.
    if (!state.released) {
      state.released = true;
      client.release();
    }
  }
}

/** Race any pooled query against a client-side timer AND a server-side `SET LOCAL
 * statement_timeout` (see comment above) — the client-side race alone doesn't free a connection
 * still stuck server-side; the timeout alone doesn't help if the connection can't even be
 * acquired from the pool. Both isRevoked (read) and revokeSessionsFor (write) go through this.
 * `T` is inferred from `runQuery`'s own return type — do NOT pass an explicit type argument at the
 * call site (pentest-remediation P5-review CRITICAL: an earlier round pinned T to a row shape like
 * `{ revoked_at: string }` while `runQuery` actually returns `QueryResult<...>`, a structural
 * mismatch `next build`'s `strict` type-check correctly rejects — `vitest` doesn't type-check, so
 * this broke the production build silently past this file's own tests). */
async function withStatementTimeout<T>(runQuery: (client: PoolClient) => Promise<T>): Promise<T> {
  const state: TimeoutRaceState = { client: null, released: false, cancelled: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Always record the cancellation, even when no connection has been checked out yet — a
        // still-pending connect() has nothing to destroy here, but runInTimeoutScopedTransaction
        // needs to know not to start work once it finally does get one (pentest-remediation
        // P6-review MAJOR; see the check there).
        state.cancelled = true;
        // Lost the race — destroy (not release) the connection instead of returning it healthy to
        // the pool: BEGIN/SET LOCAL/the query itself may still be in flight on a socket we've
        // stopped waiting on, and handing back a connection whose transaction state is unknown
        // would corrupt whatever the next borrower does with it (pentest-remediation P5-review
        // MAJOR M2 — `client.release()`'s normal path never runs until the stuck query itself
        // settles, which may be never; `release(true)` drops the connection from the pool now).
        if (state.client && !state.released) {
          state.released = true;
          state.client.release(true);
        }
        reject(new Error('statement timed out'));
      }, REVOCATION_CHECK_TIMEOUT_MS);
    });
    return await Promise.race([runInTimeoutScopedTransaction(runQuery, state), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// pentest-remediation P7-review (MAJOR 1): isRevoked() ran a dedicated pool checkout +
// BEGIN/SET LOCAL/SELECT/COMMIT (4 round-trips) on EVERY authenticated request — ~67 of ~74 API
// routes call verifyUser(), and one dashboard page fans several of them out in parallel against a
// pool of `max: 3`. That interferes both ways: heavy inventory/compliance queries starve auth
// checkouts (→ the check times out → fails open → this whole control is silently off), and auth
// checkouts starve the data queries (→ 500s that look like an Aurora fault). Cache the resolved
// cutoff per sub for a few seconds.
//
// Safe because the cutoff is MONOTONICALLY NON-DECREASING: revokeSessionsFor only ever advances
// `revoked_at` (`WHERE session_revocations.revoked_at < to_timestamp($2)`), so a cached value can
// only be stale in the PERMISSIVE direction, and only for at most the TTL — it can never resurrect
// a session a newer cutoff already killed beyond that window. Cost of the staleness: a logged-out
// token stays usable for ≤5s past logout, a negligible extension of an already-12h token lifetime.
// In exchange the steady-state cost of the control drops from one connection + 4 round-trips per
// request to one per sub per 5s. 5s (not admin.ts's 5min) keeps the security window trivially small
// while still collapsing a whole page's parallel fan-out into a single query.
//
// The cached value is the in-flight PROMISE, not the settled result, so the parallel fan-out that
// motivated this dedupes too (all N requests await the same query instead of each missing the cache
// before the first one finishes). Failures are NOT cached — the entry is dropped on rejection, so a
// transient Aurora blip can't disable revocation for the whole TTL; only a definitive answer
// (a cutoff, or `null` for "no revocation row", which is the common case) is kept.
// Self-cleaning like recentRevokeWriteAt below: each entry removes itself when its window expires.
const REVOCATION_CACHE_TTL_MS = 5000;
type CachedCutoff = { at: number; p: Promise<number | null> };
const revocationCutoffCache = new Map<string, CachedCutoff>();

async function queryRevocationCutoff(sub: string): Promise<number | null> {
  const { rows } = await withStatementTimeout((client) =>
    client.query<{ revoked_at: string }>('SELECT revoked_at FROM session_revocations WHERE user_sub = $1', [sub]),
  );
  return rows.length === 0 ? null : new Date(rows[0].revoked_at).getTime() / 1000;
}

function revocationCutoff(sub: string): Promise<number | null> {
  const hit = revocationCutoffCache.get(sub);
  if (hit && Date.now() - hit.at < REVOCATION_CACHE_TTL_MS) return hit.p;
  const entry: CachedCutoff = { at: Date.now(), p: queryRevocationCutoff(sub) };
  revocationCutoffCache.set(sub, entry);
  const drop = () => {
    if (revocationCutoffCache.get(sub) === entry) revocationCutoffCache.delete(sub);
  };
  entry.p.catch(drop); // never cache a fail-open result
  setTimeout(drop, REVOCATION_CACHE_TTL_MS);
  return entry.p;
}

const WARN_DEDUPE_MS = 10_000;
const recentWarnAt = new Set<string>();

async function isRevoked(sub: string, iat: number | undefined): Promise<boolean> {
  if (!iat) return true; // malformed token (no iat) — fail closed, this one input we don't trust
  try {
    const revokedAtSec = await revocationCutoff(sub);
    if (revokedAtSec === null) return false;
    // `<=`, not strict `<`: revokeSessionsFor stores the signing-out token's OWN iat as the
    // cutoff. With strict `<`, that exact token's own check evaluates `iat < iat` -> false, i.e.
    // the very token just used to log out is judged NOT revoked and stays valid for its full
    // remaining lifetime — defeating the point of this whole mechanism (pentest-remediation
    // P3-review CRITICAL). `<=` closes that. A same-second re-login lands on a token with the
    // same or a later `iat`, so in the pathological same-`iat` case the rejected token itself
    // never "heals" (iat is fixed at issuance — it can't advance on its own). Recovery is via
    // re-login: the rejected verifyUser() sends the edge redirect to /login, and authenticating
    // again mints a genuinely later iat that passes (pentest-remediation P4-review MINOR — this
    // used to describe it as self-healing "the next request once time advances a second", which
    // is wrong; a same-iat token stays rejected for its entire remaining lifetime, not one request).
    return iat <= revokedAtSec;
  } catch (e) {
    // fail open — see comment above the timeout constant / module comment.
    // pentest-remediation P7-review (MINOR): failures aren't cached (by design), so a sustained
    // Aurora outage would otherwise emit one warn line per authenticated request — a log flood
    // exactly when the logs matter. One line per sub per window is enough for the metric filter /
    // alarm in terraform/v2/foundation/workload.tf to fire. Self-cleaning, same as the maps
    // above.
    if (!recentWarnAt.has(sub)) {
      recentWarnAt.add(sub);
      setTimeout(() => recentWarnAt.delete(sub), WARN_DEDUPE_MS);
      console.warn(JSON.stringify({ evt: 'revocation_check_failed', sub, err: e instanceof Error ? e.message : String(e) }));
    }
    return false;
  }
}

/** Record that `sub`'s sessions issued up to now are no longer valid. Called by POST
 * /api/auth/signout with the signed-out token's own `iat` (epoch seconds). Idempotent (upsert) —
 * but the cutoff only advances if `iat` is newer than what's already recorded.
 * pentest-remediation P2-review (MAJOR-1): without the `iat` bound, replaying an already-revoked
 * (but not-yet-expired) token against the public signout route kept pushing `revoked_at` to
 * `now()` on every call — a rolling forced-logout DoS on any session the victim created *after*
 * their first real logout, for as long as the stolen token stays unexpired (up to ~12h). Capping
 * the cutoff at this token's own `iat` means a replay can never invalidate a session issued after
 * the legitimate revocation.
 * pentest-remediation P4-review (MAJOR): now goes through withStatementTimeout like isRevoked
 * (see comment there) instead of a raw getPool().query — the caller (POST /api/auth/signout)
 * already wraps this call in a try/catch that clears the cookie and redirects regardless, so a
 * thrown timeout here degrades exactly like any other write failure: best-effort, fail-open. */
// pentest-remediation P5-review (MAJOR M3): /api/auth/signout is public and has no rate limit — a
// single valid token (an attacker's own, or a stolen-but-live one) replayed in a tight parallel
// loop drives repeated connect→BEGIN→SET LOCAL→UPSERT→COMMIT round-trips through the `max: 3`
// pool. Once the pool is saturated, isRevoked() for every OTHER user's request starts timing out
// too, and its fail-open path means the revocation control this whole PR adds gets silently
// disabled for everyone, not just the attacker's own account. The UPSERT's WHERE guard already
// makes a same-or-older-iat replay a costless no-op *at the database*, so the fix is simply to
// stop paying for the round-trip at all when we've already written for this sub very recently —
// legitimate signout only ever needs to land once. Self-cleaning: each entry removes itself after
// the debounce window, so this can't grow unbounded across the life of a long-running container.
// Keyed by (sub, iat) rather than sub alone: the actual replay attack resends the SAME captured
// token (same iat) — a legitimately *different* token from the same sub (a fresh signout with a
// newer iat) must still write through, since only the exact-token replay is a costless no-op.
const RECENT_REVOKE_DEBOUNCE_MS = 2000;
const recentRevokeWriteAt = new Map<string, number>();

export async function revokeSessionsFor(sub: string, iat: number): Promise<void> {
  const key = `${sub}:${iat}`;
  const now = Date.now();
  const last = recentRevokeWriteAt.get(key);
  if (last !== undefined && now - last < RECENT_REVOKE_DEBOUNCE_MS) return;
  recentRevokeWriteAt.set(key, now);
  setTimeout(() => {
    if (recentRevokeWriteAt.get(key) === now) recentRevokeWriteAt.delete(key);
  }, RECENT_REVOKE_DEBOUNCE_MS);
  await withStatementTimeout((client) =>
    client.query(
      `INSERT INTO session_revocations (user_sub, revoked_at) VALUES ($1, to_timestamp($2))
       ON CONFLICT (user_sub) DO UPDATE SET revoked_at = to_timestamp($2)
       WHERE session_revocations.revoked_at < to_timestamp($2)`,
      [sub, iat],
    ),
  );
  // pentest-remediation P7-review (MAJOR 1): the write just moved the cutoff, so a cached cutoff
  // for this sub is now wrong (permissively). Drop it so the user's OWN logout takes effect on the
  // next request instead of waiting out the TTL. This is per-CONTAINER: other ECS tasks keep
  // serving their own cached cutoff until it expires, i.e. ≤REVOCATION_CACHE_TTL_MS of extra
  // validity elsewhere in the fleet — the accepted tradeoff (recorded in ADR-002 §2-4).
  revocationCutoffCache.delete(sub);
}

/** Re-verify the edge-set Cognito id_token (awsops_token cookie). Returns the user or null. */
export async function verifyUser(cookieHeader: string | null): Promise<User | null> {
  const token = parseCookie(cookieHeader, 'awsops_token');
  if (!token) return null;
  const region = process.env.AWS_REGION || 'ap-northeast-2';
  const pool = process.env.COGNITO_USER_POOL_ID;
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://cognito-idp.${region}.amazonaws.com/${pool}`,
      audience: process.env.COGNITO_CLIENT_ID,
      algorithms: ['RS256'], // Cognito id tokens are always RS256; pin to block alg-confusion
    });
    if (payload.token_use !== 'id' || !payload.sub) return null;
    const sub = String(payload.sub);
    if (await isRevoked(sub, payload.iat)) return null;
    const rawGroups = (payload as Record<string, unknown>)['cognito:groups'];
    const groups = Array.isArray(rawGroups) ? rawGroups.map(String) : [];
    return {
      sub,
      // Only a VERIFIED email is adopted. The legacy ownership branch authorizes reads (and
      // PATCH/DELETE via canMutateReport) on this value, and Cognito lets a user change their own
      // email — so an unverified claim made the exposure self-service rather than admin-only: set
      // your address to a departed colleague's, read their reports (PR #203 review MAJOR, 2 models).
      // Deleted users' rows are exactly the ones the backfill leaves unmapped, so that window would
      // also have been the longest-lived. auth.tf additionally removes email from the client's
      // writable attributes; this is the half that holds even if a pool is reconfigured by hand.
      // Dropping the claim (rather than rejecting the token) is deliberate: an unverified-email user
      // stays logged in and keeps every sub-keyed row — they simply lose the legacy email match.
      email: payload.email && payload.email_verified === true ? String(payload.email) : undefined,
      groups,
    };
  } catch {
    return null;
  }
}

/**
 * Display identity — email if present, else sub. NOT an authorization key: email is mutable and can
 * be reassigned, so ownership must never be derived from this. Writes record `user.sub`; this exists
 * for rendering and for the legacy read path below.
 */
export function identity(user: User): string {
  return user.email || user.sub;
}

/**
 * Whether the legacy email-keyed ownership match is still accepted on READ. Rows written before the
 * sub cut-over hold `requested_by = <email>`, and their real owners would be locked out without it.
 *
 * PR #195 review MAJOR (4 models, 2 lenses): `matchesIdentity()` used to accept the email form
 * UNCONDITIONALLY. Cognito reassigns addresses (`username_attributes = ["email"]`), so a departed
 * user's address landing on a new account let that new sub read the previous owner's legacy rows —
 * with no way to close the window short of a full backfill. This flag is that way: set
 * `LEGACY_EMAIL_OWNER_MATCH=false` once the backfill (PR #203's `make backfill-owner-sub`) has
 * rewritten those rows. Until then a reassigned email can still match — that is the exposure the
 * backfill closes — but it is now a named, flippable switch instead of an unconditional accept, and
 * an operator who wants zero window before the backfill runs can flip it early and accept the
 * lockout that causes for existing users.
 */
function legacyEmailMatchEnabled(): boolean {
  return process.env.LEGACY_EMAIL_OWNER_MATCH !== 'false';
}

/**
 * LEGACY ONLY — do not call from new code. Matches a pre-cut-over `requested_by = <email>` row.
 * Kept as its own named function so the email branch is greppable and removable in one place;
 * folding it back into an `||` inside matchesIdentity() is what let it spread into authorization
 * unconditionally in the first place.
 */
export function matchesLegacyEmailOwner(owner: string, user: User): boolean {
  return legacyEmailMatchEnabled() && !!user.email && owner === user.email;
}

/**
 * Ownership keys to filter a LIST query by, for the same user. Mirrors matchesIdentity() exactly —
 * `sub` always, plus the legacy email form only while LEGACY_EMAIL_OWNER_MATCH is on. Row-level
 * checks and list filters MUST agree, otherwise flipping the flag would sub-only the detail routes
 * while the lists kept matching on email.
 */
export function ownerKeysForRead(user: User): string[] {
  return legacyEmailMatchEnabled() && user.email ? [user.email, user.sub] : [user.sub];
}

/**
 * Every key this token could have been recorded under, NOT gated on legacy_email_owner_match.
 *
 * ownerKeysForRead() is for POSITIVE checks — "may I see this row?" — where dropping the legacy form
 * costs visibility. This is for NEGATIVE ones, where a missed match is a security hole instead: the
 * 4-eyes gate rejects an approver who EQUALS the creator, so if the comparison misses the legacy form
 * the same human approves their own plan. Flipping the flag off must not re-open that.
 */
export function identityKeys(user: User): string[] {
  return user.email ? [user.sub, user.email] : [user.sub];
}

/**
 * Canonical ownership check. `user.sub` is the only key new rows carry; the legacy email form is
 * accepted separately and only while the flag above is on.
 */
export function matchesIdentity(owner: string | null | undefined, user: User): boolean {
  if (!owner) return false;
  if (owner === user.sub) return true;
  return matchesLegacyEmailOwner(owner, user);
}

// pentest-remediation P1-review (MAJOR-1): the original `clockTolerance: '3650 days'` accepted
// ANY expired token, no matter how old — a token expired for weeks (e.g. an old leaked cookie)
// could still hit this public, unauthenticated route and revoke the victim's *current* sessions,
// repeatedly. There's no legitimate reason for that: an id_token already expired by more than
// ordinary clock/network skew can't be used for anything else, so accepting it here bought zero
// benefit while opening a logout-DoS. 5 minutes covers real skew/latency, not a replayed-forever
// stale token.
const SIGNOUT_CLOCK_TOLERANCE = '5 minutes';

/** Like verifyUser, but tolerates a token expired within `SIGNOUT_CLOCK_TOLERANCE` — signature/
 * issuer/audience/token_use are still fully checked, so this cannot be forged. Used only by
 * signout: a user must be able to log out (and revoke) with a token that just expired (clock
 * skew / request latency), and the whole point of revocation-on-logout is to cut off a token
 * that may be stolen but is still (nearly) live. Never use this for granting access — only for
 * extracting a trusted `sub` to revoke. */
export async function verifyUserForSignout(cookieHeader: string | null): Promise<User | null> {
  const token = parseCookie(cookieHeader, 'awsops_token');
  if (!token) return null;
  const region = process.env.AWS_REGION || 'ap-northeast-2';
  const pool = process.env.COGNITO_USER_POOL_ID;
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://cognito-idp.${region}.amazonaws.com/${pool}`,
      audience: process.env.COGNITO_CLIENT_ID,
      algorithms: ['RS256'],
      clockTolerance: SIGNOUT_CLOCK_TOLERANCE,
    });
    if (payload.token_use !== 'id' || !payload.sub || !payload.iat) return null;
    // `iat` is returned so the caller (signout route) can bound revokeSessionsFor's cutoff to
    // this specific token's issue time — see MAJOR-1 comment on revokeSessionsFor.
    return { sub: String(payload.sub), iat: payload.iat };
  } catch {
    return null;
  }
}
