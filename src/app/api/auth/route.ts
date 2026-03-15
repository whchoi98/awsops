// Logout API — HttpOnly 쿠키는 JavaScript로 삭제 불가하므로 서버에서 Set-Cookie로 만료
// HttpOnly cookies cannot be deleted via JavaScript, so server clears via Set-Cookie
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // awsops_token 쿠키를 Max-Age=0으로 즉시 만료 / Expire cookie immediately
  response.headers.set('Set-Cookie',
    'awsops_token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'
  );

  return response;
}
