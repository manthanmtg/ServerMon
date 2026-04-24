import { describe, it, expect } from 'vitest';
import { RouteTemplateZodSchema } from './RouteTemplate';

const baseValid = {
  name: 'Default HTTP',
  slug: 'default-http',
  defaults: {
    protocol: 'http' as const,
    websocket: false,
    timeoutSec: 60,
    uploadBodyMb: 32,
    headers: {},
    accessMode: 'servermon_auth' as const,
    logLevel: 'info' as const,
  },
};

describe('RouteTemplateZodSchema', () => {
  it('accepts minimal valid payload with defaults', () => {
    const parsed = RouteTemplateZodSchema.parse(baseValid);
    expect(parsed.kind).toBe('custom');
    expect(parsed.source).toBe('user');
  });

  it('rejects invalid slug', () => {
    expect(() => RouteTemplateZodSchema.parse({ ...baseValid, slug: 'BAD Slug' })).toThrow();
  });

  it('rejects invalid kind enum', () => {
    expect(() => RouteTemplateZodSchema.parse({ ...baseValid, kind: 'vendor' })).toThrow();
  });

  it('rejects invalid protocol enum', () => {
    expect(() =>
      RouteTemplateZodSchema.parse({
        ...baseValid,
        defaults: { ...baseValid.defaults, protocol: 'ftp' },
      })
    ).toThrow();
  });
});
