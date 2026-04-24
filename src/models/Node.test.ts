import { describe, it, expect } from 'vitest';
import { NodeZodSchema } from './Node';

describe('NodeZodSchema', () => {
  it('accepts minimal valid payload', () => {
    const parsed = NodeZodSchema.parse({ name: 'Orion', slug: 'orion' });
    expect(parsed.status).toBe('unpaired');
    expect(parsed.tags).toEqual([]);
    expect(parsed.frpcConfig.tlsEnabled).toBe(true);
    expect(parsed.frpcConfig.transportEncryptionEnabled).toBe(true);
    expect(parsed.frpcConfig.protocol).toBe('tcp');
  });
  it('rejects bad slug', () => {
    expect(() => NodeZodSchema.parse({ name: 'x', slug: 'Orion!' })).toThrow();
  });
  it('rejects bad protocol', () => {
    expect(() =>
      NodeZodSchema.parse({
        name: 'x',
        slug: 'x',
        frpcConfig: { protocol: 'smoke' },
      })
    ).toThrow();
  });
});
