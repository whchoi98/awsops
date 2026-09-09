import { verifyUserForSignout, revokeSessionsFor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Sign-out is intentionally NOT auth-gated: an expired/invalid token must still be able to
// log out. HttpOnly cookies can only be cleared server-side, so we expire awsops_token here and
// return { redirect: '/login' } so the client lands on the in-app login form. There is no Cognito
// hosted-UI /logout round-trip anymore — the v2 self-hosted /login form has no hosted-UI browser
// session to break (the hosted-UI code flow survives only as a dark fallback). The edge must let
// this path through public (cognito_edge.py.tftpl is_public) — otherwise an expired token traps the
// user in a 302→login loop and they can never reach the signout route to clear the stale cookie.
//
// pentest-remediation P1-1 (Finding 1): clearing the cookie alone left the id_token itself fully
// valid for the rest of its ~12h lifetime — Cognito GlobalSignOut cannot revoke an id_token. Best-
// effort record a server-side revocation for the token's sub (verifyUserForSignout tolerates an
// already-expired token — the whole point of revoking on logout is to cut off a token that may be
// old/stolen). This must never block the response: the cookie always gets cleared and the client
// always gets redirected, even if there's no token, the token is unverifiable, or the DB write fails.
export async function POST(request: Request) {
  let sub: string | undefined;
  try {
    const user = await verifyUserForSignout(request.headers.get('cookie'));
    sub = user?.sub;
    if (user && user.iat) await revokeSessionsFor(user.sub, user.iat);
  } catch (e) {
    // best-effort — logout must succeed regardless; log so a persistently-failing revocation
    // write isn't silently invisible (symmetric with isRevoked's revocation_check_failed warning,
    // which also logs `sub` — pentest-remediation P3-review MINOR).
    console.warn(JSON.stringify({ evt: 'revocation_write_failed', sub, err: e instanceof Error ? e.message : String(e) }));
  }
  return new Response(JSON.stringify({ redirect: '/login' }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': 'awsops_token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
    },
  });
}
