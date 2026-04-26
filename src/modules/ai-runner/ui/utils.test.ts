/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  describeWeekdays,
  emptyScheduleForm,
  formatCountdown,
  formatDayOfWeekField,
  formatDuration,
  getDefaultCronExpressionForMode,
  getRunStatusVariant,
  getScheduleStatusVariant,
  humanizeCron,
  parseScheduleBuilder,
} from './utils';

describe('ai-runner ui utils', () => {
  describe('emptyScheduleForm', () => {
    it('prefers explicit values over defaults', () => {
      expect(emptyScheduleForm('profile-1', '/tmp/work')).toMatchObject({
        agentProfileId: 'profile-1',
        workingDirectory: '/tmp/work',
        timeout: 30,
        retries: 1,
        cronExpression: '0 9 * * 1-5',
        enabled: true,
      });
    });

    it('falls back to the public default workdir when no directory is provided', () => {
      const previous = process.env.NEXT_PUBLIC_DEFAULT_WORKDIR;
      process.env.NEXT_PUBLIC_DEFAULT_WORKDIR = '/srv/default';

      try {
        expect(emptyScheduleForm().workingDirectory).toBe('/srv/default');
      } finally {
        process.env.NEXT_PUBLIC_DEFAULT_WORKDIR = previous;
      }
    });
  });

  describe('formatDuration', () => {
    it('formats empty, second, minute, and hour durations', () => {
      expect(formatDuration()).toBe('—');
      expect(formatDuration(45)).toBe('45s');
      expect(formatDuration(125)).toBe('2m 5s');
      expect(formatDuration(3665)).toBe('1h 1m');
    });
  });

  describe('formatCountdown', () => {
    const now = new Date('2026-04-22T11:38:00.000Z').getTime();

    it('handles missing, due, future, and overdue targets', () => {
      expect(formatCountdown(undefined, now)).toBe('Waiting for enablement');
      expect(formatCountdown('2026-04-22T11:38:00.000Z', now)).toBe('due now');
      expect(formatCountdown('2026-04-22T11:39:05.000Z', now)).toBe('in 1m 5s');
      expect(formatCountdown('2026-04-21T10:36:56.000Z', now)).toBe('overdue by 1d 1h 1m 4s');
    });
  });

  describe('weekday helpers', () => {
    it('compresses weekday selections into cron ranges', () => {
      expect(formatDayOfWeekField([])).toBe('*');
      expect(formatDayOfWeekField([1, 2, 3, 4, 5])).toBe('1-5');
      expect(formatDayOfWeekField([6, 0, 2, 2])).toBe('0,2,6');
    });

    it('describes common weekday groups and custom selections', () => {
      expect(describeWeekdays([])).toBe('Every day');
      expect(describeWeekdays([1, 2, 3, 4, 5])).toBe('Weekdays');
      expect(describeWeekdays([0, 6])).toBe('Weekends');
      expect(describeWeekdays([5, 1, 3])).toBe('Mon, Wed, Fri');
    });
  });

  describe('parseScheduleBuilder', () => {
    it('parses interval, hourly, daily, weekly, and monthly expressions', () => {
      expect(parseScheduleBuilder('*/15 * * * *')).toEqual({ mode: 'every', interval: 15 });
      expect(parseScheduleBuilder('5 * * * *')).toEqual({ mode: 'hourly', minute: 5 });
      expect(parseScheduleBuilder('30 9 * * *')).toEqual({ mode: 'daily', hour: 9, minute: 30 });
      expect(parseScheduleBuilder('45 6 * * 1-5')).toEqual({
        mode: 'weekly',
        hour: 6,
        minute: 45,
        days: [1, 2, 3, 4, 5],
      });
      expect(parseScheduleBuilder('0 8 1 * *')).toEqual({
        mode: 'monthly',
        dayOfMonth: 1,
        hour: 8,
        minute: 0,
      });
    });

    it('treats invalid or unsupported cron expressions as advanced', () => {
      expect(parseScheduleBuilder('*/0 * * * *')).toEqual({ mode: 'advanced' });
      expect(parseScheduleBuilder('0 9 * * 5-1')).toEqual({ mode: 'advanced' });
      expect(parseScheduleBuilder('0 9 * * * extra')).toEqual({ mode: 'advanced' });
    });
  });

  describe('humanizeCron', () => {
    it('adds a cronstrue description for custom cron expressions', () => {
      expect(humanizeCron('30 1-23/2 * * *')).toBe(
        'Custom cron: 30 1-23/2 * * * (At 30 minutes past the hour, every 2 hours, between 01:00 AM and 11:59 PM)'
      );
    });
  });

  describe('status helpers', () => {
    it('maps schedule statuses to badge variants', () => {
      expect(getScheduleStatusVariant('completed')).toBe('success');
      expect(getScheduleStatusVariant('running')).toBe('warning');
      expect(getScheduleStatusVariant('failed')).toBe('destructive');
      expect(getScheduleStatusVariant(undefined)).toBe('outline');
    });

    it('maps run statuses to badge variants', () => {
      expect(getRunStatusVariant('completed')).toBe('success');
      expect(getRunStatusVariant('running')).toBe('default');
      expect(getRunStatusVariant('queued')).toBe('warning');
      expect(getRunStatusVariant('timeout')).toBe('destructive');
      expect(getRunStatusVariant(undefined)).toBe('outline');
    });
  });

  describe('getDefaultCronExpressionForMode', () => {
    it('returns mode-specific defaults and omits advanced mode', () => {
      expect(getDefaultCronExpressionForMode('every')).toBe('*/15 * * * *');
      expect(getDefaultCronExpressionForMode('hourly')).toBe('0 * * * *');
      expect(getDefaultCronExpressionForMode('daily')).toBe('0 9 * * *');
      expect(getDefaultCronExpressionForMode('weekly')).toBe('0 9 * * 1-5');
      expect(getDefaultCronExpressionForMode('monthly')).toBe('0 9 1 * *');
      expect(getDefaultCronExpressionForMode('advanced')).toBeNull();
    });
  });
});
