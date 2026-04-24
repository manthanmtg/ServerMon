import { describe, it, expect } from 'vitest';
import { BackupJobZodSchema } from './BackupJob';

const baseValid = {
  type: 'manual' as const,
  scopes: ['nodes', 'configs'],
  destination: { kind: 'local' as const, path: '/var/backups' },
};

describe('BackupJobZodSchema', () => {
  it('accepts minimal valid payload with defaults', () => {
    const parsed = BackupJobZodSchema.parse(baseValid);
    expect(parsed.encryption.mode).toBe('none');
    expect(parsed.retentionDays).toBe(30);
    expect(parsed.status).toBe('queued');
  });

  it('rejects invalid type enum', () => {
    expect(() => BackupJobZodSchema.parse({ ...baseValid, type: 'automatic' })).toThrow();
  });

  it('rejects empty scopes', () => {
    expect(() => BackupJobZodSchema.parse({ ...baseValid, scopes: [] })).toThrow();
  });

  it('rejects invalid scope value', () => {
    expect(() => BackupJobZodSchema.parse({ ...baseValid, scopes: ['invalid-scope'] })).toThrow();
  });

  it('rejects invalid destination kind', () => {
    expect(() =>
      BackupJobZodSchema.parse({
        ...baseValid,
        destination: { kind: 'ftp', path: '/x' },
      })
    ).toThrow();
  });
});
