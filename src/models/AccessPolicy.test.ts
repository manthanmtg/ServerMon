import { describe, it, expect } from 'vitest';
import { AccessPolicyZodSchema } from './AccessPolicy';

describe('AccessPolicyZodSchema', () => {
  it('accepts minimal valid payload with defaults', () => {
    const parsed = AccessPolicyZodSchema.parse({
      name: 'default',
      mode: 'public',
    });
    expect(parsed.ipAllowlist).toEqual([]);
    expect(parsed.basicAuth).toEqual([]);
    expect(parsed.schedule.windows).toEqual([]);
    expect(parsed.temporaryShare.enabled).toBe(false);
    expect(parsed.allowedUserRoles).toEqual([]);
  });

  it('rejects invalid mode enum', () => {
    expect(() => AccessPolicyZodSchema.parse({ name: 'x', mode: 'vip' })).toThrow();
  });

  it('rejects missing name', () => {
    expect(() => AccessPolicyZodSchema.parse({ mode: 'public' })).toThrow();
  });

  it('accepts schedule windows', () => {
    const parsed = AccessPolicyZodSchema.parse({
      name: 'business-hours',
      mode: 'ip_allowlist',
      schedule: {
        timezone: 'UTC',
        windows: [{ daysOfWeek: [1, 2, 3], startMinute: 540, endMinute: 1020 }],
      },
    });
    expect(parsed.schedule.windows).toHaveLength(1);
  });
});
