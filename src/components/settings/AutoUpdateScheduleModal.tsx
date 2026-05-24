import React, { useMemo } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  deriveScheduleSelectState,
  HOUR_OPTIONS,
  TimeParts,
  buildScheduleTime,
} from './AutoUpdateScheduleUtils';

interface AutoUpdateScheduleModalProps {
  scheduleForm: {
    enabled: boolean;
    time: string;
    timezone: string;
  };
  setScheduleForm: React.Dispatch<
    React.SetStateAction<{
      enabled: boolean;
      time: string;
      timezone: string;
    }>
  >;
  autoSettingsTimezone?: string | null;
  title?: string;
  enableLabel?: string;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export function AutoUpdateScheduleModal({
  scheduleForm,
  setScheduleForm,
  autoSettingsTimezone,
  title = 'Local Auto-Update Schedule',
  enableLabel = 'Enable local auto-update',
  onClose,
  onSave,
  isSaving,
}: AutoUpdateScheduleModalProps) {
  const { timezoneOptions, scheduleTimeParts, minuteOptions } = useMemo(
    () => deriveScheduleSelectState(scheduleForm.time, scheduleForm.timezone, autoSettingsTimezone),
    [autoSettingsTimezone, scheduleForm.time, scheduleForm.timezone]
  );

  const updateScheduleTime = (patch: Partial<TimeParts>) => {
    setScheduleForm((form) => ({
      ...form,
      time: buildScheduleTime({ ...scheduleTimeParts, ...patch }),
    }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close auto-update schedule dialog"
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm cursor-default border-0"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-auto-update-title"
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <h3 id="local-auto-update-title" className="text-lg font-bold text-foreground">
              {title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This schedule checks upstream first, then launches update work detached through
              systemd.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close schedule modal"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 text-sm font-semibold text-foreground">
            <span>{enableLabel}</span>
            <input
              aria-label={enableLabel}
              type="checkbox"
              checked={scheduleForm.enabled}
              onChange={(event) =>
                setScheduleForm((form) => ({ ...form, enabled: event.target.checked }))
              }
              className="h-5 w-5 accent-primary"
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Daily time
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px]">
              <select
                aria-label="Daily hour"
                value={scheduleTimeParts.hour}
                onChange={(event) =>
                  updateScheduleTime({ hour: event.target.value as TimeParts['hour'] })
                }
                className="h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
              >
                {HOUR_OPTIONS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
              <select
                aria-label="Daily minute"
                value={scheduleTimeParts.minute}
                onChange={(event) => updateScheduleTime({ minute: event.target.value })}
                className="h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
              >
                {minuteOptions.map((minute) => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
              </select>
              <select
                aria-label="Daily period"
                value={scheduleTimeParts.period}
                onChange={(event) =>
                  updateScheduleTime({ period: event.target.value as TimeParts['period'] })
                }
                className="h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Timezone
            </span>
            <select
              aria-label="Timezone"
              value={scheduleForm.timezone}
              onChange={(event) =>
                setScheduleForm((form) => ({ ...form, timezone: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
            >
              {timezoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            {[
              'Check before updating',
              'Include running local agent',
              'Stop agent update if app fails',
              'Missed run retry: 2 hours, 1 retry',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border bg-muted/20 p-6 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="h-11 rounded-xl" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button className="h-11 rounded-xl" loading={isSaving} onClick={onSave}>
            Save Schedule
          </Button>
        </div>
      </div>
    </div>
  );
}
