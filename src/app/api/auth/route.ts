// Auth API — Login (Cognito InitiateAuth) + Logout (cookie clear)
// 인증 API — 로그인 (Cognito InitiateAuth) + 로그아웃 (쿠키 삭제)
import { NextRequest, NextResponse } from 'next/server';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import * as crypto from 'crypto';

const REGION = process.env.COGNITO_REGION || 'ap-northeast-2';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || '';

let cognitoClient: CognitoIdentityProviderClient | null = null;
function getClient(): CognitoIdentityProviderClient {
  if (!cognitoClient) cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
  return cognitoClient;
}

// Compute SECRET_HASH for Cognito app client with secret
function computeSecretHash(email: string): string {
  if (!CLIENT_SECRET) return '';
  return crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(email + CLIENT_ID)
    .digest('base64');
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body = logout request
  }
  const action = body.action as string | undefined;

  // --- Login ---
  if (action === 'login') {
    const { email, password, remember } = body as { email: string; password: string; remember?: boolean; action: string };

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    if (!USER_POOL_ID || !CLIENT_ID) {
      return NextResponse.json({ error: 'Cognito not configured. Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID env vars.' }, { status: 500 });
    }

    try {
      const authParams: Record<string, string> = {
        USERNAME: email,
        PASSWORD: password,
      };

      const secretHash = computeSecretHash(email);
      if (secretHash) authParams.SECRET_HASH = secretHash;

      const client = getClient();
      const resp = await client.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: authParams,
      }));

      const idToken = resp.AuthenticationResult?.IdToken;
      if (!idToken) {
        // Challenge required (MFA, NEW_PASSWORD, etc.)
        if (resp.ChallengeName) {
          return NextResponse.json({
            error: `Authentication challenge: ${resp.ChallengeName}. Please use the Cognito console to complete setup.`,
            challenge: resp.ChallengeName,
          }, { status: 403 });
        }
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
      }

      // Set HttpOnly cookie with ID token (same format as Lambda@Edge)
      const maxAge = remember ? 30 * 24 * 60 * 60 : 60 * 60; // 30 days or 1 hour
      const response = NextResponse.json({ ok: true });
      response.headers.set('Set-Cookie',
        `awsops_token=${idToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
      );
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';

      // Map Cognito errors to user-friendly messages
      if (message.includes('NotAuthorizedException')) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }
      if (message.includes('UserNotFoundException')) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }
      if (message.includes('UserNotConfirmedException')) {
        return NextResponse.json({ error: 'Account not confirmed. Check your email.' }, { status: 403 });
      }
      if (message.includes('PasswordResetRequiredException')) {
        return NextResponse.json({ error: 'Password reset required. Contact admin.' }, { status: 403 });
      }

      console.error('[Auth] Login failed:', message);
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }
  }

  // --- Logout (existing) ---
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie',
    'awsops_token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'
  );
  return response;
}
