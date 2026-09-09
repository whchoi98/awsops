-- since: 2.1.0
-- session_revocations — pentest-remediation P1-1 (Finding 1). POST /api/auth/signout only ever
-- cleared the client-side cookie; the Cognito RS256 id_token (12h lifetime) had no server-side
-- revocation, so a captured token stayed fully valid for its whole remaining window after logout.
-- Cognito GlobalSignOut cannot revoke an already-issued id_token (only refresh/access tokens), so
-- revocation has to live in our own store. One row per user (sub), not one row per token/jti — a
-- logout invalidates sessions issued at or before that token's iat (NOT every session: a session
-- issued strictly AFTER the signout token's iat is untouched by design — that's the anti-replay-DoS
-- guard, see revokeSessionsFor in web/lib/auth.ts). Single row per sub keeps this table from
-- growing unbounded. verifyUser() (web/lib/auth.ts) rejects any token whose `iat` is at or before
-- the user's revoked_at.
CREATE TABLE IF NOT EXISTS session_revocations (
  user_sub   TEXT PRIMARY KEY,
  revoked_at TIMESTAMPTZ NOT NULL
);
