import { describe, it, expect } from 'vitest';
import { ImportedConfigZodSchema } from './ImportedConfig';

describe('ImportedConfigZodSchema', () => {
  it('accepts minimal valid payload with defaults', () => {
    const parsed = ImportedConfigZodSchema.parse({
      kind: 'frp',
      raw: '[common]\nbind_port = 7000',
    });
    expect(parsed.status).toBe('unmanaged');
    expect(parsed.conflicts).toEqual([]);
    expect(parsed.importedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid kind enum', () => {
    expect(() => ImportedConfigZodSchema.parse({ kind: 'apache', raw: 'x' })).toThrow();
  });

  it('rejects invalid status enum', () => {
    expect(() =>
      ImportedConfigZodSchema.parse({
        kind: 'nginx',
        raw: 'x',
        status: 'parked',
      })
    ).toThrow();
  });

  it('rejects missing raw', () => {
    expect(() => ImportedConfigZodSchema.parse({ kind: 'frp' })).toThrow();
  });
});
