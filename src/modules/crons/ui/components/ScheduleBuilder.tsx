'use client';

import { useState } from 'react';
import { ChevronDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ScheduleField = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

export interface ScheduleBuilderProps {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  onChange: (field: ScheduleField, value: string) => void;
}

const PRESETS: Array<{ label: string; expr: string }> = [
  { label: 'Every minute', expr: '* * * * *' },
  { label: 'Every 5 minutes', expr: '*/5 * * * *' },
  { label: 'Every 15 minutes', expr: '*/15 * * * *' },
  { label: 'Every 30 minutes', expr: '*/30 * * * *' },
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Every 6 hours', expr: '0 */6 * * *' },
  { label: 'Daily at midnight', expr: '0 0 * * *' },
  { label: 'Daily at 2 AM', expr: '0 2 * * *' },
  { label: 'Weekly (Sunday)', expr: '0 0 * * 0' },
  { label: 'Monthly (1st)', expr: '0 0 1 * *' },
  { label: 'Weekdays at 9 AM', expr: '0 9 * * 1-5' },
];

const SCHEDULE_FIELDS: Array<{
  label: string;
  field: ScheduleField;
  placeholder: string;
}> = [
  { label: 'Minute', field: 'minute', placeholder: '0-59, */5, *' },
  { label: 'Hour', field: 'hour', placeholder: '0-23, */2, *' },
  { label: 'Day of Month', field: 'dayOfMonth', placeholder: '1-31, *' },
  { label: 'Month', field: 'month', placeholder: '1-12, *' },
  { label: 'Day of Week', field: 'dayOfWeek', placeholder: '0-7, 1-5, *' },
];

export function ScheduleBuilder({
  minute,
  hour,
  dayOfMonth,
  month,
  dayOfWeek,
  onChange,
}: ScheduleBuilderProps) {
  const [showPresets, setShowPresets] = useState(false);

  function applyPreset(expr: string) {
    const [nextMinute, nextHour, nextDayOfMonth, nextMonth, nextDayOfWeek] = expr.split(' ');
    onChange('minute', nextMinute);
    onChange('hour', nextHour);
    onChange('dayOfMonth', nextDayOfMonth);
    onChange('month', nextMonth);
    onChange('dayOfWeek', nextDayOfWeek);
    setShowPresets(false);
  }

  const values: Record<ScheduleField, string> = {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
  };
  const expression = `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
  const description = describeScheduleClient(minute, hour, dayOfMonth, month, dayOfWeek);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Expression:
        </span>
        <code className="px-2 py-1 rounded-md bg-muted text-sm font-mono">{expression}</code>
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPresets(!showPresets)}
            className="text-xs"
          >
            Presets
            <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
          {showPresets && (
            <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-xl border border-border bg-card shadow-lg py-1 max-h-64 overflow-y-auto">
              {PRESETS.map((preset) => (
                <button
                  key={preset.expr}
                  type="button"
                  onClick={() => applyPreset(preset.expr)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center justify-between"
                >
                  <span>{preset.label}</span>
                  <code className="text-[10px] text-muted-foreground">{preset.expr}</code>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {SCHEDULE_FIELDS.map(({ label, field, placeholder }) => (
          <label key={field} className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <input
              type="text"
              value={values[field]}
              onChange={(e) => onChange(field, e.target.value)}
              placeholder={placeholder}
              className="w-full h-9 px-2 rounded-lg border border-border bg-background text-sm font-mono text-center outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        ))}
      </div>

      <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
        <p className="text-xs text-foreground">
          <Clock className="w-3 h-3 inline mr-1 text-primary" />
          <span className="font-medium">{description}</span>
        </p>
      </div>
    </div>
  );
}

function describeScheduleClient(
  minute: string,
  hour: string,
  dom: string,
  month: string,
  dow: string
): string {
  if (minute === '*' && hour === '*') return 'Runs every minute';
  if (minute === '0' && hour === '*') return 'Runs at the start of every hour';
  if (minute === '0' && hour === '0' && dom === '*' && month === '*' && dow === '*')
    return 'Runs daily at midnight';
  if (minute === '0' && hour === '0' && dom === '1' && month === '*' && dow === '*')
    return 'Runs monthly on the 1st at midnight';
  if (minute === '0' && hour === '0' && dom === '*' && month === '*' && dow === '0')
    return 'Runs weekly on Sunday at midnight';

  const parts: string[] = [];

  if (minute.includes('/')) parts.push(`Every ${minute.split('/')[1]} minutes`);
  else if (minute !== '*') parts.push(`At minute ${minute}`);
  else parts.push('Every minute');

  if (hour.includes('/')) parts.push(`every ${hour.split('/')[1]} hours`);
  else if (hour !== '*') parts.push(`at hour ${hour}`);

  if (dom !== '*') parts.push(`on day ${dom}`);
  if (month !== '*') parts.push(`in month ${month}`);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (dow !== '*') {
    const dayParts = dow.split(',').map((d) => {
      if (d.includes('-')) {
        const [start, end] = d.split('-').map(Number);
        return `${dayNames[start % 7] || start}-${dayNames[end % 7] || end}`;
      }
      const dayNumber = parseInt(d, 10);
      return isNaN(dayNumber) ? d : dayNames[dayNumber % 7] || d;
    });
    parts.push(`on ${dayParts.join(', ')}`);
  }

  return parts.length > 0 ? parts.join(' ') : `${minute} ${hour} ${dom} ${month} ${dow}`;
}
