import { describe, expect, it } from 'vitest';
import { formatCountdown, formatPastTime } from './time';

describe('cron time helpers', () => {
  it('formats hour, minute, and second countdowns', () => {
    const now = Date.UTC(2026, 3, 19, 0, 0, 0);
    const target = new Date(now + (5 * 3600 + 3 * 60 + 6) * 1000).toISOString();

    expect(formatCountdown(target, now)).toBe('5h 3m 6s');
  });

  it('formats day countdowns with the remaining hours, minutes, and seconds', () => {
    const now = Date.UTC(2026, 3, 19, 0, 0, 0);
    const target = new Date(now + (2 * 86_400 + 4 * 3600 + 5 * 60 + 6) * 1000).toISOString();

    expect(formatCountdown(target, now)).toBe('2d 4h 5m 6s');
  });

  it('formats minute countdowns without an hour segment', () => {
    const now = Date.UTC(2026, 3, 19, 0, 0, 0);
    const target = new Date(now + (12 * 60 + 4) * 1000).toISOString();

    expect(formatCountdown(target, now)).toBe('12m 4s');
  });

  it('formats short countdowns in seconds', () => {
    const now = Date.UTC(2026, 3, 19, 0, 0, 0);
    const target = new Date(now + 8 * 1000).toISOString();

    expect(formatCountdown(target, now)).toBe('8s');
  });

  it('floors partial countdown seconds', () => {
    const now = Date.UTC(2026, 3, 19, 0, 0, 0);
    const target = new Date(now + 1999).toISOString();

    expect(formatCountdown(target, now)).toBe('1s');
  });

  it('marks countdowns due at the exact target time', () => {
    const now = Date.UTC(2026, 3, 19, 0, 0, 10);
    const target = new Date(now).toISOString();

    expect(formatCountdown(target, now)).toBe('due');
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

  it('formats very recent past timestamps as just now', () => {
    const now = Date.UTC(2026, 3, 19, 0, 10, 0);
    const target = new Date(now - 29 * 1000).toISOString();

    expect(formatPastTime(target, now)).toBe('just now');
  });

  it('rounds past timestamps to the nearest minute', () => {
    const now = Date.UTC(2026, 3, 19, 0, 10, 0);
    const target = new Date(now - 89 * 1000).toISOString();

    expect(formatPastTime(target, now)).toBe('1m ago');
  });

  it('formats past timestamps in hours', () => {
    const now = Date.UTC(2026, 3, 19, 5, 0, 0);
    const target = new Date(now - 3 * 60 * 60 * 1000).toISOString();

    expect(formatPastTime(target, now)).toBe('3h ago');
  });

  it('formats past timestamps in days', () => {
    const now = Date.UTC(2026, 3, 22, 0, 0, 0);
    const target = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

    expect(formatPastTime(target, now)).toBe('2d ago');
  });

  it('treats future past-time inputs as just now', () => {
    const now = Date.UTC(2026, 3, 19, 0, 10, 0);
    const target = new Date(now + 5 * 60 * 1000).toISOString();

    expect(formatPastTime(target, now)).toBe('just now');
  });
});
