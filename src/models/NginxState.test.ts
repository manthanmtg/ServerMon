import { describe, it, expect } from 'vitest';
import { NginxStateZodSchema } from './NginxState';

describe('NginxStateZodSchema', () => {
  it('accepts minimal payload with defaults', () => {
    const parsed = NginxStateZodSchema.parse({});
    expect(parsed.key).toBe('global');
    expect(parsed.managed).toBe(false);
    expect(parsed.runtimeState).toBe('unknown');
    expect(parsed.managedServerNames).toEqual([]);
    expect(parsed.detectedConflicts).toEqual([]);
  });

  it('rejects invalid runtimeState enum', () => {
    expect(() => NginxStateZodSchema.parse({ runtimeState: 'nuked' })).toThrow();
  });

  it('accepts conflict entries', () => {
    const parsed = NginxStateZodSchema.parse({
      detectedConflicts: [
        { serverName: 'foo.example.com', filePath: '/etc/nginx/foo', reason: 'dupe' },
      ],
    });
    expect(parsed.detectedConflicts).toHaveLength(1);
  });
});
