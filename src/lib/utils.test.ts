import { describe, it, expect } from 'vitest';
import { cn, formatBytes } from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('should join class names', () => {
      expect(cn('a', 'b')).toBe('a b');
    });

    it('should filter out falsy values', () => {
      expect(cn('a', null, undefined, false, 'b')).toBe('a b');
    });
  });

  describe('formatBytes', () => {
    it('should format binary bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KiB');
      expect(formatBytes(1024 * 1024)).toBe('1 MiB');
    });

    it('should format decimal bytes correctly', () => {
      expect(formatBytes(1000, 'decimal')).toBe('1 KB');
      expect(formatBytes(1000 * 1000, 'decimal')).toBe('1 MB');
    });
  });
});
