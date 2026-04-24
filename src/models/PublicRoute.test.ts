import { describe, it, expect } from 'vitest';
import { PublicRouteZodSchema } from './PublicRoute';

const baseValid = {
  name: 'API',
  slug: 'api',
  domain: 'api.example.com',
  nodeId: 'node-1',
  proxyRuleName: 'api-rule',
  target: { localIp: '127.0.0.1', localPort: 3000, protocol: 'http' as const },
};

describe('PublicRouteZodSchema', () => {
  it('accepts minimal valid payload and applies defaults', () => {
    const parsed = PublicRouteZodSchema.parse(baseValid);
    expect(parsed.path).toBe('/');
    expect(parsed.tlsEnabled).toBe(true);
    expect(parsed.tlsStatus).toBe('unknown');
    expect(parsed.accessMode).toBe('servermon_auth');
    expect(parsed.status).toBe('pending_dns');
    expect(parsed.healthStatus).toBe('unknown');
    expect(parsed.dnsStatus).toBe('unknown');
    expect(parsed.websocketEnabled).toBe(false);
    expect(parsed.http2Enabled).toBe(true);
    expect(parsed.maxBodyMb).toBe(32);
    expect(parsed.timeoutSeconds).toBe(60);
    expect(parsed.compression).toBe(true);
    expect(parsed.headers).toEqual({});
    expect(parsed.enabled).toBe(true);
  });

  it('rejects invalid slug', () => {
    expect(() => PublicRouteZodSchema.parse({ ...baseValid, slug: 'Bad Slug!' })).toThrow();
  });

  it('rejects missing domain', () => {
    const { domain: _d, ...rest } = baseValid;
    expect(() => PublicRouteZodSchema.parse(rest)).toThrow();
  });

  it('rejects missing target', () => {
    const { target: _t, ...rest } = baseValid;
    expect(() => PublicRouteZodSchema.parse(rest)).toThrow();
  });

  it('rejects invalid accessMode enum', () => {
    expect(() => PublicRouteZodSchema.parse({ ...baseValid, accessMode: 'anonymous' })).toThrow();
  });

  it('rejects invalid status enum', () => {
    expect(() => PublicRouteZodSchema.parse({ ...baseValid, status: 'chaos' })).toThrow();
  });
});
