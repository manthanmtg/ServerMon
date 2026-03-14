import { describe, it, expect } from 'vitest';
import { cn, formatBytes, formatDuration } from './utils';

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

    it('should handle no arguments', () => {
      expect(cn()).toBe('');
    });
  });

  describe('formatBytes', () => {
    it('should format zero bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format binary bytes correctly', () => {
      expect(formatBytes(1024)).toBe('1 KiB');
      expect(formatBytes(1024 * 1024)).toBe('1 MiB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GiB');
    });

    it('should format decimal bytes correctly', () => {
      expect(formatBytes(1000, 'decimal')).toBe('1 KB');
      expect(formatBytes(1000 * 1000, 'decimal')).toBe('1 MB');
      expect(formatBytes(1000 * 1000 * 1000, 'decimal')).toBe('1 GB');
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
  });
});
