import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  GenerateRegistrationOptionsOpts,
  VerifyRegistrationResponseOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';
import type { NextRequest } from 'next/server';

export const RP_NAME = 'ServerMon';

function firstHeaderValue(value: string | null | undefined): string | null {
  const first = value?.split(',')[0]?.trim();
  return first || null;
}

function normalizeHost(value: string | null | undefined, stripPort = false): string {
  let host = firstHeaderValue(value) ?? '';

  if (!host) {
    return '';
  }

  if (host.includes('://')) {
    try {
      host = new URL(host).host;
    } catch {
      host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    }
  }

  host = host.split('/')[0]?.trim().toLowerCase() ?? '';

  if (!stripPort) {
    return host;
  }

  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host : host.slice(1, end);
  }

  const colonCount = (host.match(/:/g) ?? []).length;
  return colonCount === 1 ? host.split(':')[0] : host;
}

function getForwardedHost(req: NextRequest): string {
  return (
    normalizeHost(req.headers.get('x-forwarded-host')) ||
    normalizeHost(req.headers.get('host')) ||
    'localhost'
  );
}

function configuredRPID(): string | null {
  return normalizeHost(process.env.WEBAUTHN_RP_ID, true) || null;
}

function configuredOrigin(): string | null {
  const origin = firstHeaderValue(process.env.WEBAUTHN_ORIGIN);

  if (!origin) {
    return null;
  }

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

/**
 * Get the expected origin from the request.
 * Accounts for reverse proxies and environment.
 */
export function getOrigin(req: NextRequest): string {
  const envOrigin = configuredOrigin();
  if (envOrigin) {
    return envOrigin;
  }

  const requestOrigin = firstHeaderValue(req.headers.get('origin'));
  if (requestOrigin) {
    try {
      return new URL(requestOrigin).origin;
    } catch {
      // Fall back to forwarded headers below.
    }
  }

  const host = getForwardedHost(req);
  const proto =
    firstHeaderValue(req.headers.get('x-forwarded-proto')) ||
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return `${proto}://${host}`;
}

/**
 * Get the RP ID (domain) from the request host or request headers.
 */
export function getRPID(hostOrReq: string | NextRequest): string {
  const envRPID = configuredRPID();
  if (envRPID) {
    return envRPID;
  }

  const host =
    typeof hostOrReq === 'string'
      ? normalizeHost(hostOrReq, true)
      : normalizeHost(getForwardedHost(hostOrReq), true);

  return host || 'localhost';
}

/**
 * Generate options for a user to register a new passkey.
 */
export async function getPasskeyRegistrationOptions(options: GenerateRegistrationOptionsOpts) {
  return await generateRegistrationOptions(options);
}

/**
 * Verify the registration response from the client.
 */
export async function verifyPasskeyRegistration(options: VerifyRegistrationResponseOpts) {
  return await verifyRegistrationResponse(options);
}

/**
 * Generate options for a user to log in with a passkey.
 */
export async function getPasskeyLoginOptions(options: GenerateAuthenticationOptionsOpts) {
  return await generateAuthenticationOptions(options);
}

/**
 * Verify the authentication response from the client.
 */
export async function verifyPasskeyLogin(options: VerifyAuthenticationResponseOpts) {
  return await verifyAuthenticationResponse(options);
}
