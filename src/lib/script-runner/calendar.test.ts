import { describe, expect, it } from 'vitest';
import { nextCalendarRun } from './calendar';

const daily = { frequency: 'daily' as const, time: '07:00', timeZone: 'Asia/Kolkata' };

describe('Script Runner calendar schedules', () => {
  it('uses the selected timezone and advances strictly past the reference time', () => {
    expect(nextCalendarRun(daily, new Date('2026-11-20T23:00:00Z')).toISOString()).toBe(
      '2026-11-21T01:30:00.000Z'
    );
    expect(nextCalendarRun(daily, new Date('2026-11-21T01:30:00Z')).toISOString()).toBe(
      '2026-11-22T01:30:00.000Z'
    );
  });

  it('skips weekends in the schedule timezone', () => {
    const weekdays = { ...daily, frequency: 'weekdays' as const, timeZone: 'Pacific/Auckland' };
    expect(nextCalendarRun(weekdays, new Date('2026-11-20T12:00:00Z')).toISOString()).toBe(
      '2026-11-22T18:00:00.000Z'
    );
  });

  it('skips missing local times and runs only once at repeated local times', () => {
    const spring = { ...daily, time: '02:30', timeZone: 'America/New_York' };
    expect(nextCalendarRun(spring, new Date('2026-03-08T00:00:00Z')).toISOString()).toBe(
      '2026-03-09T06:30:00.000Z'
    );
    const fall = { ...spring, time: '01:30' };
    expect(nextCalendarRun(fall, new Date('2026-11-01T00:00:00Z')).toISOString()).toBe(
      '2026-11-01T05:30:00.000Z'
    );
    expect(nextCalendarRun(fall, new Date('2026-11-01T05:30:00Z')).toISOString()).toBe(
      '2026-11-02T06:30:00.000Z'
    );
  });
});
