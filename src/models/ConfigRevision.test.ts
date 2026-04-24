import { describe, it, expect } from 'vitest';
import { ConfigRevisionZodSchema } from './ConfigRevision';

describe('ConfigRevisionZodSchema', () => {
  it('accepts minimal valid payload', () => {
    const parsed = ConfigRevisionZodSchema.parse({
      kind: 'frps',
      version: 1,
      hash: 'abc123',
      rendered: '[common]\nbind_port = 7000',
      structured: { common: { bind_port: 7000 } },
    });
    expect(parsed.kind).toBe('frps');
    expect(parsed.version).toBe(1);
  });

  it('rejects invalid kind', () => {
    expect(() =>
      ConfigRevisionZodSchema.parse({
        kind: 'apache',
        version: 1,
        hash: 'x',
        rendered: '',
        structured: {},
      })
    ).toThrow();
  });

  it('rejects version below 1', () => {
    expect(() =>
      ConfigRevisionZodSchema.parse({
        kind: 'frpc',
        version: 0,
        hash: 'x',
        rendered: '',
        structured: {},
      })
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => ConfigRevisionZodSchema.parse({})).toThrow();
    expect(() => ConfigRevisionZodSchema.parse({ kind: 'nginx' })).toThrow();
  });
});
