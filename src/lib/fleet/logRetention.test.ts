import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_FLEET_LOG_RETENTION_DAYS,
  DEFAULT_METRICS_SAMPLE_RETENTION_DAYS,
  getFleetLogRetentionDays,
  getMetricsSampleRetentionDays,
  retentionUntilFromDays,
} from './logRetention';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('logRetention', () => {
  afterEach(() => {
    delete process.env.FLEET_LOG_RETENTION_DAYS;
    delete process.env.FLEET_METRICS_SAMPLE_RETENTION_DAYS;
  });

  it('returns the default retention days when env vars are unset', () => {
    expect(getFleetLogRetentionDays()).toBe(DEFAULT_FLEET_LOG_RETENTION_DAYS);
    expect(getMetricsSampleRetentionDays()).toBe(DEFAULT_METRICS_SAMPLE_RETENTION_DAYS);
  });

  it('parses valid env overrides', () => {
    process.env.FLEET_LOG_RETENTION_DAYS = '90';
    process.env.FLEET_METRICS_SAMPLE_RETENTION_DAYS = '7';
    expect(getFleetLogRetentionDays()).toBe(90);
    expect(getMetricsSampleRetentionDays()).toBe(7);
  });

  it('falls back to the default on invalid env overrides', () => {
    process.env.FLEET_LOG_RETENTION_DAYS = 'not-a-number';
    process.env.FLEET_METRICS_SAMPLE_RETENTION_DAYS = '-5';
    expect(getFleetLogRetentionDays()).toBe(DEFAULT_FLEET_LOG_RETENTION_DAYS);
    expect(getMetricsSampleRetentionDays()).toBe(DEFAULT_METRICS_SAMPLE_RETENTION_DAYS);
  });

  it('falls back to the default on out-of-range env overrides', () => {
    process.env.FLEET_LOG_RETENTION_DAYS = '0';
    process.env.FLEET_METRICS_SAMPLE_RETENTION_DAYS = '99999';
    expect(getFleetLogRetentionDays()).toBe(DEFAULT_FLEET_LOG_RETENTION_DAYS);
    expect(getMetricsSampleRetentionDays()).toBe(DEFAULT_METRICS_SAMPLE_RETENTION_DAYS);
  });

  it('computes retentionUntil days from now', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    expect(retentionUntilFromDays(30, now).toISOString()).toBe('2026-02-14T00:00:00.000Z');
  });

  it('computes negative cutoffs for backfill jobs', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    expect(retentionUntilFromDays(-30, now).toISOString()).toBe('2025-12-16T00:00:00.000Z');
  });

  it('round-trips across a day boundary with real time', () => {
    const before = Date.now();
    const expiry = retentionUntilFromDays(1);
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + DAY_MS - 1000);
    expect(expiry.getTime()).toBeLessThanOrEqual(Date.now() + DAY_MS + 1000);
  });
});
