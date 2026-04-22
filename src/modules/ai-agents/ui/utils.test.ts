/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { formatDuration, statusTextColor, statusVariant } from './utils';

describe('ai-agents ui utils', () => {
  describe('statusVariant', () => {
    it('maps known session statuses to badge variants', () => {
      expect(statusVariant('running')).toBe('success');
      expect(statusVariant('idle')).toBe('warning');
      expect(statusVariant('error')).toBe('destructive');
      expect(statusVariant('waiting')).toBe('default');
    });

    it('falls back to the secondary variant for unknown statuses', () => {
      expect(statusVariant('completed')).toBe('secondary');
      expect(statusVariant('paused')).toBe('secondary');
    });
  });

  describe('statusTextColor', () => {
    it('returns the configured semantic color for known statuses', () => {
      expect(statusTextColor('running')).toBe('text-success');
      expect(statusTextColor('idle')).toBe('text-warning');
      expect(statusTextColor('waiting')).toBe('text-primary');
      expect(statusTextColor('error')).toBe('text-destructive');
      expect(statusTextColor('completed')).toBe('text-muted-foreground');
    });

    it('falls back to the muted foreground color for unknown statuses', () => {
      expect(statusTextColor('paused')).toBe('text-muted-foreground');
    });
  });

  describe('formatDuration', () => {
    it('handles zero and negative durations as just started', () => {
      expect(formatDuration(0)).toBe('just started');
      expect(formatDuration(-5)).toBe('just started');
    });

    it('formats second-only durations', () => {
      expect(formatDuration(1)).toBe('1s');
      expect(formatDuration(59)).toBe('59s');
    });

    it('formats minute durations with remaining seconds', () => {
      expect(formatDuration(60)).toBe('1m 0s');
      expect(formatDuration(125)).toBe('2m 5s');
    });

    it('formats hour durations with remaining minutes', () => {
      expect(formatDuration(3600)).toBe('1h 0m');
      expect(formatDuration(7265)).toBe('2h 1m');
    });
  });
});
