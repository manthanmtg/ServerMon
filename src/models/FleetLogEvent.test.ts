import { describe, it, expect, afterEach } from 'vitest';
import { FleetLogEventZodSchema, type IFleetLogEvent } from './FleetLogEvent';
import FleetLogEvent from './FleetLogEvent';
import { DEFAULT_FLEET_LOG_RETENTION_DAYS } from '@/lib/fleet/logRetention';

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

describe('FleetLogEventSchema', () => {
  afterEach(() => {
    delete process.env.FLEET_LOG_RETENTION_DAYS;
  });

  it('defaults retentionUntil to ~30 days from now', () => {
    const before = Date.now();
    const doc = new FleetLogEvent({
      service: 'servermon',
      level: 'info',
      eventType: 'boot',
    });
    const retention: unknown = doc.get('retentionUntil');
    expect(retention).toBeInstanceOf(Date);
    const ms30 = DEFAULT_FLEET_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    expect((retention as Date).getTime()).toBeGreaterThanOrEqual(before + ms30 - 1000);
    expect((retention as Date).getTime()).toBeLessThanOrEqual(Date.now() + ms30 + 1000);
  });

  it('keeps explicit retentionUntil overrides untouched', () => {
    const explicit = new Date('2027-01-01T00:00:00.000Z');
    const doc: IFleetLogEvent = new FleetLogEvent({
      service: 'servermon',
      level: 'audit',
      eventType: 'node.pair',
      retentionUntil: explicit,
    });
    expect(doc.retentionUntil).toBe(explicit);
  });

  it('honors FLEET_LOG_RETENTION_DAYS for the default expiry', () => {
    process.env.FLEET_LOG_RETENTION_DAYS = '7';
    const before = Date.now();
    const doc = new FleetLogEvent({
      service: 'servermon',
      level: 'info',
      eventType: 'boot',
    });
    const retention = doc.get('retentionUntil') as unknown;
    expect(retention).toBeInstanceOf(Date);
    const ms7 = 7 * 24 * 60 * 60 * 1000;
    expect((retention as Date).getTime()).toBeGreaterThanOrEqual(before + ms7 - 1000);
    expect((retention as Date).getTime()).toBeLessThanOrEqual(Date.now() + ms7 + 1000);
  });

  it('keeps the TTL index on retentionUntil', () => {
    const indexes = FleetLogEvent.schema.indexes() as Array<
      [Record<string, unknown>, Record<string, unknown>]
    >;
    const ttlIndex = indexes.find(([spec]) => 'retentionUntil' in spec);
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.[1].expireAfterSeconds).toBe(0);
  });
});
