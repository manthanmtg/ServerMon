import type { CalendarSchedule } from '@/modules/script-runner/types';

const DAY_MS = 86_400_000;
export const calendarTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isNamedTimeZone(timeZone: string) {
  if (!/^[A-Za-z][\w+-]*(?:\/[\w+-]+)*$/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function nextCalendarRun(schedule: CalendarSchedule, after: Date): Date {
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: schedule.timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  function localTimestamp(timestamp: number) {
    const local = Object.fromEntries(
      clock.formatToParts(timestamp).map(({ type, value }) => [type, Number(value)])
    );
    return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  }

  const [hour, minute] = schedule.time.split(':').map(Number);
  const localToday = Math.floor(localTimestamp(after.getTime()) / DAY_MS) * DAY_MS;
  for (let days = 0; days < 14; days++) {
    const day = localToday + days * DAY_MS;
    const weekday = new Date(day).getUTCDay();
    if (schedule.frequency === 'weekdays' && (weekday === 0 || weekday === 6)) continue;

    // Test the offsets on either side of a possible clock change.
    const target = day + (hour * 60 + minute) * 60_000;
    const guesses = [target - DAY_MS, target, target + DAY_MS];
    const matches = guesses
      .map((guess) => target - (localTimestamp(guess) - guess))
      .filter((actual) => localTimestamp(actual) === target);
    // A skipped wall time has no match. A repeated wall time uses its first occurrence.
    const first = Math.min(...matches);
    if (Number.isFinite(first) && first > after.getTime()) return new Date(first);
  }

  throw new Error('Could not find the next calendar run.');
}
