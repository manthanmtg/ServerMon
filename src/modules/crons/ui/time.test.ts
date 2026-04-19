import { describe, expect, it } from 'vitest';
import { formatCountdown, formatPastTime } from './time';

describe('cron time helpers', () => {
  it('formats hour, minute, and second countdowns', () => {
    const now = Date.UTC(2026, 3, 19, 0, 0, 0);
    const target = new Date(now + (5 * 3600 + 3 * 60 + 6) * 1000).toISOString();

    expect(formatCountdown(target, now)).toBe('5h 3m 6s');
  });

  it('formats short countdowns in seconds', () => {
    const now = Date.UTC(2026, 3, 19, 0, 0, 0);
    const target = new Date(now + 8 * 1000).toISOString();

    expect(formatCountdown(target, now)).toBe('8s');
  });

  it('marks elapsed countdowns as due', () => {
    const now = Date.UTC(2026, 3, 19, 0, 0, 10);
    const target = new Date(now - 1000).toISOString();

    expect(formatCountdown(target, now)).toBe('due');
  });

  it('formats past timestamps relative to now', () => {
    const now = Date.UTC(2026, 3, 19, 0, 10, 0);
    const target = new Date(now - 5 * 60 * 1000).toISOString();

    expect(formatPastTime(target, now)).toBe('5m ago');
  });
});
