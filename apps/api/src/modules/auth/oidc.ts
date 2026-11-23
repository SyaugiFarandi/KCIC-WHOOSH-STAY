import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  ClientSecretPost,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/errors.js';
import { ERROR_CODES } from '@whoosh/shared';

export const OIDC_STATE_COOKIE = 'whoosh_stay_oidc_state';
const STATE_TTL_MS = 10 * 60 * 1000;

interface StatePayload {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  issuedAt: number;
}

let configurationPromise: Promise<Configuration> | null = null;

function requireOidcSettings(): {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string;
} {
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID || !env.OIDC_REDIRECT_URI) {
    throw new AppError(
      503,
      ERROR_CODES.CONFIGURATION_ERROR,
      'OIDC is not configured for this environment',
    );
  }
  return {
    issuer: env.OIDC_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET || undefined,
    redirectUri: env.OIDC_REDIRECT_URI,
    scope: env.OIDC_SCOPE,
  };
}

async function getConfiguration(): Promise<Configuration> {
  if (!configurationPromise) {
    const settings = requireOidcSettings();
    configurationPromise = discovery(
      new URL(settings.issuer),
      settings.clientId,
      undefined,
      settings.clientSecret ? ClientSecretPost(settings.clientSecret) : undefined,
    ).catch((error) => {
      configurationPromise = null;
      throw error;
    });
  }
  return configurationPromise;
}

export function resetOidcConfigurationForTests(): void {
  configurationPromise = null;
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(encodedPayload).digest('base64url');
}

function normalizeReturnTo(returnTo: string | undefined): string {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) return '/';
  return returnTo;
}

export async function beginOidcLogin(returnTo?: string): Promise<{
  redirectUrl: string;
  stateCookie: string;
}> {
  const settings = requireOidcSettings();
  const config = await getConfiguration();
  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const state = randomState();
  const nonce = randomNonce();

  const redirectUrl = buildAuthorizationUrl(config, {
    redirect_uri: settings.redirectUri,
    scope: settings.scope,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const payload: StatePayload = {
    state,
    nonce,
    codeVerifier,
    returnTo: normalizeReturnTo(returnTo),
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encoded);

  return { redirectUrl: redirectUrl.toString(), stateCookie: `${encoded}.${signature}` };
}

export function parseOidcStateCookie(value: string | undefined): StatePayload | null {
  if (!value) return null;
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) return null;

  const expected = signPayload(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as StatePayload;
    if (Date.now() - payload.issuedAt > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface OidcIdentity {
  issuer: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  returnTo: string;
}

export async function completeOidcLogin(
  currentUrl: URL,
  stateCookieValue: string | undefined,
  receivedState: string | undefined,
): Promise<OidcIdentity> {
  const settings = requireOidcSettings();
  const config = await getConfiguration();
  const payload = parseOidcStateCookie(stateCookieValue);

  if (!payload || !receivedState || payload.state !== receivedState) {
    throw new AppError(400, ERROR_CODES.AUTH_REQUIRED, 'OIDC state validation failed');
  }

  const tokens = await authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: payload.codeVerifier,
    expectedState: payload.state,
    expectedNonce: payload.nonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (!claims?.sub) {
    throw new AppError(400, ERROR_CODES.AUTH_REQUIRED, 'OIDC response has no subject claim');
  }
  const email = (claims.email as string | undefined)?.toLowerCase();
  if (!email) {
    throw new AppError(400, ERROR_CODES.AUTH_REQUIRED, 'OIDC response has no email claim');
  }

  return {
    issuer: settings.issuer,
    subject: claims.sub,
    email,
    emailVerified: claims.email_verified === true,
    name: (claims.name as string | undefined) ?? undefined,
    returnTo: payload.returnTo,
  };
}
