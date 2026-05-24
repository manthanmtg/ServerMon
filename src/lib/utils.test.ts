import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cn, formatBytes, formatDuration, relativeTime, slugify } from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('should join class names', () => {
      expect(cn('a', 'b')).toBe('a b');
    });

    it('should filter out falsy values', () => {
      expect(cn('a', null, undefined, false, 'b')).toBe('a b');
    });

    it('should return empty string when all values are falsy', () => {
      expect(cn(null, undefined, false)).toBe('');
    });

    it('should return single class when given one argument', () => {
      expect(cn('only')).toBe('only');
    });

    it('should handle empty string inputs', () => {
      expect(cn('a', '', 'b')).toBe('a b');
    });

    it('should handle boolean and numeric values (ignoring falsy ones)', () => {
      expect(
        cn('a', true && 'b', false && 'c', 0 as unknown as string, 1 as unknown as string)
      ).toBe('a b 1');
    });

    it('should handle no arguments', () => {
      expect(cn()).toBe('');
    });
  });

  describe('formatBytes', () => {
    it('should format zero bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should handle negative values as zero', () => {
      expect(formatBytes(-1024)).toBe('0 B');
    });

    it('should handle null or undefined', () => {
      expect(formatBytes(null)).toBe('0 B');
      expect(formatBytes(undefined)).toBe('0 B');
    });

    it('should format binary bytes correctly', () => {
      expect(formatBytes(1024)).toBe('1 KiB');
      expect(formatBytes(1024 * 1024)).toBe('1 MiB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GiB');
      expect(formatBytes(Math.pow(1024, 4))).toBe('1 TiB');
    });

    it('should format decimal bytes correctly', () => {
      expect(formatBytes(1000, 'decimal')).toBe('1 KB');
      expect(formatBytes(1000 * 1000, 'decimal')).toBe('1 MB');
      expect(formatBytes(1000 * 1000 * 1000, 'decimal')).toBe('1 GB');
      expect(formatBytes(Math.pow(1000, 4), 'decimal')).toBe('1 TB');
    });

    it('should default to binary system', () => {
      expect(formatBytes(2048)).toBe('2 KiB');
    });

    it('should handle fractional values', () => {
      expect(formatBytes(1536)).toBe('1.5 KiB');
    });

    it('should format small byte values', () => {
      expect(formatBytes(512)).toBe('512 B');
    });

    it('should round byte values to one decimal place', () => {
      expect(formatBytes(1537)).toBe('1.5 KiB');
      expect(formatBytes(1500, 'decimal')).toBe('1.5 KB');
    });

    it('should promote values that round up at unit boundaries', () => {
      expect(formatBytes(1023.95)).toBe('1024 B');
      expect(formatBytes(999.95, 'decimal')).toBe('1000 B');
    });

    it('should treat non-finite values as zero bytes', () => {
      expect(formatBytes(Number.NaN)).toBe('0 B');
      expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
      expect(formatBytes(Number.NEGATIVE_INFINITY)).toBe('0 B');
    });

    it('should cap binary values above TiB at the TiB unit', () => {
      expect(formatBytes(Math.pow(1024, 5))).toBe('1024 TiB');
    });

    it('should cap decimal values above TB at the TB unit', () => {
      expect(formatBytes(Math.pow(1000, 5), 'decimal')).toBe('1000 TB');
    });

    it('should keep fractional precision when binary values exceed TiB', () => {
      expect(formatBytes(1.5 * Math.pow(1024, 5))).toBe('1536 TiB');
    });

    it('should keep fractional precision when decimal values exceed TB', () => {
      expect(formatBytes(1.5 * Math.pow(1000, 5), 'decimal')).toBe('1500 TB');
    });

    it('should preserve fractional bytes as one decimal place', () => {
      expect(formatBytes(0.2)).toBe('0.2 B');
      expect(formatBytes(1.05)).toBe('1.1 B');
    });

    it('should keep sub-threshold values in B unit', () => {
      expect(formatBytes(999.9)).toBe('999.9 B');
    });

    it('should keep fractional precision for decimal mode', () => {
      expect(formatBytes(1500.4, 'decimal')).toBe('1.5 KB');
    });
  });

  describe('formatDuration', () => {
    it('should return "0 secs" for zero or negative', () => {
      expect(formatDuration(0)).toBe('0 secs');
      expect(formatDuration(-1)).toBe('0 secs');
    });

    it('should format seconds only', () => {
      expect(formatDuration(1)).toBe('1 sec');
      expect(formatDuration(45)).toBe('45 secs');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60)).toBe('1 min');
      expect(formatDuration(90)).toBe('1 min 30 secs');
      expect(formatDuration(120)).toBe('2 mins');
    });

    it('should format hours, minutes, and seconds', () => {
      expect(formatDuration(3600)).toBe('1 hour');
      expect(formatDuration(3661)).toBe('1 hour 1 min 1 sec');
      expect(formatDuration(7322)).toBe('2 hours 2 mins 2 secs');
    });

    it('should use singular forms correctly', () => {
      expect(formatDuration(3661)).toBe('1 hour 1 min 1 sec');
      expect(formatDuration(7322)).toBe('2 hours 2 mins 2 secs');
    });

    it('should omit zero components', () => {
      expect(formatDuration(3600)).toBe('1 hour');
      expect(formatDuration(3660)).toBe('1 hour 1 min');
    });

    it('should handle large durations', () => {
      expect(formatDuration(86400)).toBe('24 hours');
    });

    it('should return "0 secs" for non-finite durations', () => {
      expect(formatDuration(Number.NaN)).toBe('0 secs');
      expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0 secs');
      expect(formatDuration(Number.NEGATIVE_INFINITY)).toBe('0 secs');
    });

    it('should handle mixed singular and plural forms', () => {
      expect(formatDuration(3600 + 60 + 1)).toBe('1 hour 1 min 1 sec');
      expect(formatDuration(7200 + 120 + 2)).toBe('2 hours 2 mins 2 secs');
    });

    it('should floor fractional seconds before formatting', () => {
      expect(formatDuration(59.9)).toBe('59 secs');
      expect(formatDuration(60.9)).toBe('1 min');
    });

    it('should include seconds after whole hours when no minutes are present', () => {
      expect(formatDuration(3601)).toBe('1 hour 1 sec');
      expect(formatDuration(7202)).toBe('2 hours 2 secs');
    });
  });

  describe('relativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "-" for nullish values', () => {
      expect(relativeTime(null)).toBe('—');
      expect(relativeTime(undefined)).toBe('—');
      expect(relativeTime('')).toBe('—');
    });

    it('should return "-" for invalid date strings', () => {
      expect(relativeTime('not-a-date')).toBe('—');
    });

    it('should return "-" for invalid Date objects', () => {
      expect(relativeTime(new Date('not-a-date'))).toBe('—');
    });

    it('should return "-" for non-finite timestamps', () => {
      expect(relativeTime(Number.NaN)).toBe('—');
      expect(relativeTime(Number.POSITIVE_INFINITY)).toBe('—');
      expect(relativeTime(Number.NEGATIVE_INFINITY)).toBe('—');
    });

    it('should return "just now" for very recent times', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      expect(relativeTime(now)).toBe('just now');
    });

    it('should return "just now" for future times', () => {
      const future = new Date('2024-01-01T12:01:00Z');
      expect(relativeTime(future)).toBe('just now');
    });

    it('should format minutes', () => {
      const fiveMinsAgo = new Date('2024-01-01T11:55:00Z');
      expect(relativeTime(fiveMinsAgo)).toBe('5m ago');
    });

    it('should format exactly 1 minute ago', () => {
      const oneMinAgo = new Date('2024-01-01T11:59:00Z');
      expect(relativeTime(oneMinAgo)).toBe('1m ago');
    });

    it('should format hours', () => {
      const twoHoursAgo = new Date('2024-01-01T10:00:00Z');
      expect(relativeTime(twoHoursAgo)).toBe('2h ago');
    });

    it('should format days', () => {
      const twoDaysAgo = new Date('2023-12-30T12:00:00Z');
      expect(relativeTime(twoDaysAgo)).toBe('2d ago');
    });

    it('should format long ago as days', () => {
      const longAgo = new Date('2023-01-01T12:00:00Z');
      expect(relativeTime(longAgo)).toBe('365d ago');
    });

    it('should accept ISO strings and timestamps', () => {
      expect(relativeTime('2024-01-01T11:30:00Z')).toBe('30m ago');
      expect(relativeTime(new Date('2024-01-01T09:00:00Z').getTime())).toBe('3h ago');
    });

    it('should round to the nearest minute before choosing units', () => {
      expect(relativeTime('2024-01-01T11:59:31Z')).toBe('just now');
      expect(relativeTime('2024-01-01T11:59:29Z')).toBe('1m ago');
    });

    it('should round hours and days from rounded minutes', () => {
      expect(relativeTime('2024-01-01T10:31:00Z')).toBe('1h ago');
      expect(relativeTime('2023-12-31T00:30:00Z')).toBe('2d ago');
    });

    it('should round up to nearest minute before returning hours', () => {
      expect(relativeTime('2024-01-01T10:30:31Z')).toBe('1h ago');
    });

    it('should return days when the rounded hours span into next day', () => {
      expect(relativeTime('2023-12-31T11:00:00Z')).toBe('1d ago');
    });
  });

  describe('slugify', () => {
    it('should lowercase and trim', () => {
      expect(slugify('  Hello World  ')).toBe('hello-world');
    });

    it('should replace spaces and underscores with hyphens', () => {
      expect(slugify('hello_world and_more')).toBe('hello-world-and-more');
    });

    it('should remove special characters', () => {
      expect(slugify('Hello World!')).toBe('hello-world');
    });

    it('should collapse multiple hyphens', () => {
      expect(slugify('hello---world')).toBe('hello-world');
    });

    it('should handle non-latin characters by removing them', () => {
      expect(slugify('hello 世界')).toBe('hello');
    });

    it('should handle strings with only special characters', () => {
      expect(slugify('!!!')).toBe('');
      expect(slugify('   ')).toBe('');
    });

    it('should handle mixed underscores and spaces', () => {
      expect(slugify('hello_world and special_characters!')).toBe(
        'hello-world-and-special-characters'
      );
    });

    it('should handle numbers', () => {
      expect(slugify('Version 1.2.3')).toBe('version-123');
    });

    it('should trim hyphens introduced after stripping punctuation', () => {
      expect(slugify('---Hello World!!---')).toBe('hello-world');
    });

    it('should collapse mixed whitespace characters into a single hyphen', () => {
      expect(slugify('hello\tworld\nagain')).toBe('hello-world-again');
    });

    it('should remove embedded punctuation while preserving word boundaries', () => {
      expect(slugify("Jane's project plan")).toBe('janes-project-plan');
    });
  });
});
