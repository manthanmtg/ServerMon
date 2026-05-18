import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown, formatPastTime, useRealtimeNow } from './time';

describe('cron time helpers', () => {
  describe('useRealtimeNow', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-19T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns the current timestamp on initial render', () => {
      const initialNow = Date.UTC(2026, 3, 19, 0, 0, 0);

      const { result } = renderHook(() => useRealtimeNow());

      expect(result.current).toBe(initialNow);
    });

    it('updates after the default one second interval', () => {
      const { result } = renderHook(() => useRealtimeNow());

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current).toBe(Date.UTC(2026, 3, 19, 0, 0, 1));
    });

    it('does not update before the configured interval elapses', () => {
      const { result } = renderHook(() => useRealtimeNow(5000));

      act(() => {
        vi.advanceTimersByTime(4999);
      });

      expect(result.current).toBe(Date.UTC(2026, 3, 19, 0, 0, 0));
    });

    it('uses a custom interval for updates', () => {
      const { result } = renderHook(() => useRealtimeNow(5000));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current).toBe(Date.UTC(2026, 3, 19, 0, 0, 5));
    });

    it('clears the active interval when unmounted', () => {
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
      const { unmount } = renderHook(() => useRealtimeNow(2500));

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalledOnce();
      clearIntervalSpy.mockRestore();
    });
  });

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
