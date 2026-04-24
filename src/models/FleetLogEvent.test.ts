import { describe, it, expect } from 'vitest';
import { FleetLogEventZodSchema } from './FleetLogEvent';

describe('FleetLogEventZodSchema', () => {
  it('accepts minimal valid payload', () => {
    const parsed = FleetLogEventZodSchema.parse({
      service: 'servermon',
      level: 'info',
      eventType: 'boot',
    });
    expect(parsed.service).toBe('servermon');
    expect(parsed.level).toBe('info');
    expect(parsed.audit).toBe(false);
    expect(parsed.message).toBe('');
  });

  it('rejects missing required fields', () => {
    expect(() => FleetLogEventZodSchema.parse({})).toThrow();
    expect(() => FleetLogEventZodSchema.parse({ service: 'servermon', level: 'info' })).toThrow();
  });

  it('rejects invalid service enum', () => {
    expect(() =>
      FleetLogEventZodSchema.parse({
        service: 'not-a-service',
        level: 'info',
        eventType: 'boot',
      })
    ).toThrow();
  });

  it('rejects invalid level enum', () => {
    expect(() =>
      FleetLogEventZodSchema.parse({
        service: 'servermon',
        level: 'trace',
        eventType: 'boot',
      })
    ).toThrow();
  });

  it('allows metadata passthrough', () => {
    const parsed = FleetLogEventZodSchema.parse({
      service: 'frpc',
      level: 'warn',
      eventType: 'restart',
      metadata: { retries: 3, nested: { ok: true } },
    });
    expect(parsed.metadata).toEqual({ retries: 3, nested: { ok: true } });
  });
});
