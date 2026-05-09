const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC', description: 'Coordinated Universal Time' },
  { value: 'Asia/Kolkata', label: 'IST', description: 'India Standard Time' },
  { value: 'America/Los_Angeles', label: 'PST/PDT', description: 'Pacific Time' },
  { value: 'America/Denver', label: 'MST/MDT', description: 'Mountain Time' },
  { value: 'America/Chicago', label: 'CST/CDT', description: 'Central Time' },
  { value: 'America/New_York', label: 'EST/EDT', description: 'Eastern Time' },
  { value: 'Europe/London', label: 'GMT/BST', description: 'London' },
  { value: 'Europe/Berlin', label: 'CET/CEST', description: 'Central Europe' },
  { value: 'Asia/Dubai', label: 'GST', description: 'Gulf Standard Time' },
  { value: 'Asia/Singapore', label: 'SGT', description: 'Singapore Time' },
  { value: 'Asia/Tokyo', label: 'JST', description: 'Japan Standard Time' },
  { value: 'Australia/Sydney', label: 'AEST/AEDT', description: 'Sydney' },
];

export const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, '0')
);
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));

export function getTimezoneLabel(timezone: string): string {
  return getTimezoneOption(timezone)?.label ?? timezone;
}

function getTimezoneOption(timezone: string) {
  return TIMEZONE_OPTIONS.find((option) => option.value === timezone);
}

function getTimezoneOptions(...timezones: Array<string | null | undefined>) {
  const options = [...TIMEZONE_OPTIONS];
  for (const timezone of timezones) {
    if (
      !timezone ||
      getTimezoneOption(timezone) ||
      options.some((option) => option.value === timezone)
    ) {
      continue;
    }
    options.push({ value: timezone, label: timezone, description: 'Custom timezone' });
  }
  return options;
}

export function deriveScheduleSelectState(
  time: string,
  timezone: string,
  savedTimezone?: string | null
) {
  const scheduleTimeParts = parseScheduleTime(time);

  return {
    timezoneOptions: getTimezoneOptions(timezone, savedTimezone),
    scheduleTimeParts,
    minuteOptions: getMinuteOptions(scheduleTimeParts.minute),
  };
}

export function getMinuteOptions(currentMinute: string): string[] {
  return MINUTE_OPTIONS.includes(currentMinute)
    ? MINUTE_OPTIONS
    : [...MINUTE_OPTIONS, currentMinute].sort();
}

export type TimeParts = {
  hour: string;
  minute: string;
  period: 'AM' | 'PM';
};

function parseScheduleTime(time: string): TimeParts {
  const [hourText = '03', minuteText = '00'] = time.split(':');
  const hour24 = Number.parseInt(hourText, 10);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return {
    hour: String(hour12).padStart(2, '0'),
    minute: minuteText.padStart(2, '0'),
    period,
  };
}

export function buildScheduleTime(parts: TimeParts): string {
  const hour12 = Number.parseInt(parts.hour, 10);
  const hour24 =
    parts.period === 'AM' ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return `${String(hour24).padStart(2, '0')}:${parts.minute}`;
}

export function formatScheduleTime(time: string): string {
  const parts = parseScheduleTime(time);
  return `${parts.hour}:${parts.minute} ${parts.period}`;
}

export function formatNextRun(value?: string | null): string {
  if (!value) return 'Paused';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
