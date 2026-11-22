import { createLogger } from '@/lib/logger';

const log = createLogger('fleet:log-retention');

/**
 * Retention configuration for FleetLogEvent documents.
 *
 * The Mongoose TTL index on `retentionUntil` only expires documents that have
 * the field set, so every write must stamp it. Defaults live here so a single
 * knob controls the purge window.
 */

export const DEFAULT_FLEET_LOG_RETENTION_DAYS = 30;
export const DEFAULT_METRICS_SAMPLE_RETENTION_DAYS = 14;
const MAX_RETENTION_DAYS = 3650;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseRetentionDays(raw: string | undefined, fallback: number, envVar: string): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_RETENTION_DAYS) {
    log.warn(
      `Invalid ${envVar}="${raw}": expected an integer between 1 and ${MAX_RETENTION_DAYS}. Using ${fallback} days.`
    );
    return fallback;
  }
  return parsed;
}

/** Retention window (days) for general fleet log events. */
export function getFleetLogRetentionDays(): number {
  return parseRetentionDays(
    process.env.FLEET_LOG_RETENTION_DAYS,
    DEFAULT_FLEET_LOG_RETENTION_DAYS,
    'FLEET_LOG_RETENTION_DAYS'
  );
}

/** Retention window (days) for per-heartbeat metrics samples (chart data). */
export function getMetricsSampleRetentionDays(): number {
  return parseRetentionDays(
    process.env.FLEET_METRICS_SAMPLE_RETENTION_DAYS,
    DEFAULT_METRICS_SAMPLE_RETENTION_DAYS,
    'FLEET_METRICS_SAMPLE_RETENTION_DAYS'
  );
}

/** Expiry timestamp `days` from `now` (negative days allowed for cutoffs). */
export function retentionUntilFromDays(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * MS_PER_DAY);
}
