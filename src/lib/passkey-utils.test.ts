import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock heavy WebAuthn dependencies — not under test here
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

import {
  getOrigin,
  getRPID,
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  getPasskeyLoginOptions,
  verifyPasskeyLogin
} from './passkey-utils';
import type {
  GenerateRegistrationOptionsOpts,
  VerifyRegistrationResponseOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';
import type { NextRequest } from 'next/server';

function makeRequest(headers: Record<string, string | undefined>): NextRequest {
  return {
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
  } as unknown as NextRequest;
}

describe('passkey-utils', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getOrigin', () => {
    it('should build origin from host and x-forwarded-proto headers', () => {
      const req = makeRequest({ host: 'example.com', 'x-forwarded-proto': 'https' });
      expect(getOrigin(req)).toBe('https://example.com');
    });

    it('should default to http when x-forwarded-proto is absent and NODE_ENV is not production', () => {
      vi.stubEnv('NODE_ENV', 'test');

      const req = makeRequest({ host: 'localhost:3000' });
      expect(getOrigin(req)).toBe('http://localhost:3000');
    });

    it('should use https when NODE_ENV is production and x-forwarded-proto is absent', () => {
      vi.stubEnv('NODE_ENV', 'production');

      const req = makeRequest({ host: 'myserver.io' });
      expect(getOrigin(req)).toBe('https://myserver.io');
    });

    it('should fall back to localhost when host header is absent', () => {
      const req = makeRequest({ 'x-forwarded-proto': 'http' });
      expect(getOrigin(req)).toBe('http://localhost');
    });

    it('should prefer x-forwarded-proto over NODE_ENV in production', () => {
      vi.stubEnv('NODE_ENV', 'production');

      const req = makeRequest({ host: 'dev.example.com', 'x-forwarded-proto': 'http' });
      expect(getOrigin(req)).toBe('http://dev.example.com');
    });
  });

  describe('getRPID', () => {
    it('should return the hostname without port', () => {
      expect(getRPID('example.com:3000')).toBe('example.com');
    });

    it('should return the hostname unchanged when no port is present', () => {
      expect(getRPID('example.com')).toBe('example.com');
    });

    it('should handle localhost with port', () => {
      expect(getRPID('localhost:3000')).toBe('localhost');
    });

    it('should handle localhost without port', () => {
      expect(getRPID('localhost')).toBe('localhost');
    });

    it('should handle IP addresses with port', () => {
      expect(getRPID('192.168.1.1:8080')).toBe('192.168.1.1');
    });

    it('should handle IP addresses without port', () => {
      expect(getRPID('192.168.1.1')).toBe('192.168.1.1');
    });
  });

  describe('WebAuthn wrappers', () => {
    it('should call generateRegistrationOptions', async () => {
      const { generateRegistrationOptions } = await import('@simplewebauthn/server');
      const opts = { rpName: 'test' } as GenerateRegistrationOptionsOpts;
      await getPasskeyRegistrationOptions(opts);
      expect(generateRegistrationOptions).toHaveBeenCalledWith(opts);
    });

    it('should call verifyRegistrationResponse', async () => {
      const { verifyRegistrationResponse } = await import('@simplewebauthn/server');
      const opts = { expectedOrigin: 'test' } as unknown as VerifyRegistrationResponseOpts;
      await verifyPasskeyRegistration(opts);
      expect(verifyRegistrationResponse).toHaveBeenCalledWith(opts);
    });

    it('should call generateAuthenticationOptions', async () => {
      const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
      const opts = { rpID: 'test' } as GenerateAuthenticationOptionsOpts;
      await getPasskeyLoginOptions(opts);
      expect(generateAuthenticationOptions).toHaveBeenCalledWith(opts);
    });

    it('should call verifyAuthenticationResponse', async () => {
      const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
      const opts = { expectedRPID: 'test' } as unknown as VerifyAuthenticationResponseOpts;
      await verifyPasskeyLogin(opts);
      expect(verifyAuthenticationResponse).toHaveBeenCalledWith(opts);
    });
  });
});
