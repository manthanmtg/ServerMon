import React, { useMemo, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';
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
  const enabledInputRef = useRef<HTMLInputElement>(null);
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

  const description =
    'This schedule checks upstream first, then launches update work detached through systemd.';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      size="sm"
      closeLabel="Close auto-update schedule dialog"
      initialFocusRef={enabledInputRef}
      contentClassName="rounded-3xl"
      footer={
        <>
          <Button variant="ghost" className="h-11 rounded-xl" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button className="h-11 rounded-xl" loading={isSaving} onClick={onSave}>
            Save Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 text-sm font-semibold text-foreground">
          <span>{enableLabel}</span>
          <input
            ref={enabledInputRef}
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
    </Dialog>
  );
}
