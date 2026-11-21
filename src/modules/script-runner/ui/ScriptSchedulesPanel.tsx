'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { CalendarClock, Clock3, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  calendarTimePattern,
  isNamedTimeZone,
  nextCalendarRun,
} from '@/lib/script-runner/calendar';
import {
  SCHEDULE_MAX_MINUTES,
  SCHEDULE_MINUTES_STEP,
  type ScriptSchedule,
  type ScriptSummary,
  type ScheduleInput,
  type CalendarSchedule,
} from '../types';
import { errorMessage, runnerRequest } from './client';
import RunnerDialog from './RunnerDialog';

const outcomes = {
  pending: 'Queueing',
  queued: 'Queued',
  skipped: 'Skipped',
  failed: 'Could not queue',
};

type Editor = {
  scriptId: string;
  minutes: string;
  enabled: boolean;
  existing: boolean;
  kind: 'interval' | CalendarSchedule['frequency'];
  time: string;
  timeZone: string;
  previewFrom: number;
};

function editSchedule(scriptId: string, schedule?: ScriptSchedule): Editor {
  const calendar = schedule && 'calendar' in schedule ? schedule.calendar : undefined;
  return {
    scriptId,
    minutes: String(schedule && 'intervalMinutes' in schedule ? schedule.intervalMinutes : 5),
    enabled: schedule?.enabled ?? true,
    existing: !!schedule,
    kind: calendar?.frequency ?? 'interval',
    time: calendar?.time ?? '07:00',
    timeZone: calendar?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    previewFrom: Date.now(),
  };
}

function calendarPreview(calendar: CalendarSchedule, after: number) {
  let next = new Date(after);
  return Array.from({ length: 3 }, () => {
    next = nextCalendarRun(calendar, next);
    return next.toISOString();
  });
}

function intervalLabel(minutes: number) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'Every day' : `Every ${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
  }
  return `Every ${minutes} minutes`;
}

function localTime(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
}

function ScheduleCountdown({ nextRunAt, online }: { nextRunAt: string; online: boolean }) {
  const target = Date.parse(nextRunAt);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((target - Date.now()) / 1000))
  );

  useEffect(() => {
    const initialDelay = target - Date.now();
    if (!Number.isFinite(initialDelay)) return;
    function tick() {
      const delay = target - Date.now();
      setRemaining(Math.max(0, Math.ceil(delay / 1000)));
      if (delay > 0) timer = setTimeout(tick, delay % 1000 || 1000);
    }
    let timer = setTimeout(tick, initialDelay > 0 ? initialDelay % 1000 || 1000 : 0);
    return () => clearTimeout(timer);
  }, [target]);

  if (!Number.isFinite(remaining)) return null;
  const units = [
    { value: Math.floor(remaining / 86400), name: 'day', label: 'Days' },
    { value: Math.floor(remaining / 3600) % 24, name: 'hour', label: 'Hrs' },
    { value: Math.floor(remaining / 60) % 60, name: 'minute', label: 'Min' },
    { value: remaining % 60, name: 'second', label: 'Sec' },
  ];

  return (
    <div className="sr-schedule-countdown" role="timer" aria-label="Next run countdown">
      {remaining > 0 ? (
        <>
          <span className="sr-only">
            {units
              .filter(({ value }) => value > 0)
              .map(({ value, name }) => `${value} ${name}${value === 1 ? '' : 's'}`)
              .join(', ')}
          </span>
          <div aria-hidden="true">
            <span className="sr-schedule-countdown-label">
              <Clock3 size={12} /> Scheduled in
            </span>
            <div className="sr-schedule-countdown-units">
              {units.slice(units[0].value > 0 ? 0 : 1).map(({ value, label }) => (
                <span key={label}>
                  <strong>{String(value).padStart(2, '0')}</strong>
                  <small>{label}</small>
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <span className="sr-schedule-countdown-label">
          <Clock3 size={14} aria-hidden="true" /> {online ? 'Due now' : 'Waiting for worker'}
        </span>
      )}
    </div>
  );
}

export default function ScriptSchedulesPanel({
  scripts,
  online,
}: {
  scripts: ScriptSummary[];
  online: boolean;
}) {
  const [schedules, setSchedules] = useState<ScriptSchedule[]>();
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [editor, setEditor] = useState<Editor>();
  const [removing, setRemoving] = useState<ScriptSummary>();
  const [busy, setBusy] = useState(false);
  const timeZoneList = useId();

  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await runnerRequest<ScriptSchedule[]>('/schedules', {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSchedules(result);
          setLoadError('');
        }
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 5000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [busy]);

  const byScript = new Map(scripts.map((script) => [script.id, script]));
  const scheduledIds = new Set(schedules?.map((schedule) => schedule.scriptId));
  const available = scripts.filter(({ id }) => !scheduledIds.has(id));
  const entries = schedules?.flatMap((schedule) => {
    const script = byScript.get(schedule.scriptId);
    return script ? [{ schedule, script }] : [];
  });
  const calendar =
    editor && editor.kind !== 'interval'
      ? { frequency: editor.kind, time: editor.time, timeZone: editor.timeZone.trim() }
      : undefined;
  const calendarValid =
    !!calendar && calendarTimePattern.test(calendar.time) && isNamedTimeZone(calendar.timeZone);
  const upcoming =
    calendar && calendarValid && editor ? calendarPreview(calendar, editor.previewFrom) : [];

  async function save(scriptId: string, input: ScheduleInput) {
    setBusy(true);
    setActionError('');
    try {
      const result = await runnerRequest<ScriptSchedule>(`/schedules/${scriptId}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      setSchedules((old) => [
        ...(old ?? []).filter((entry) => entry.scriptId !== scriptId),
        result,
      ]);
      setEditor(undefined);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(scriptId: string) {
    setBusy(true);
    setActionError('');
    try {
      await runnerRequest(`/schedules/${scriptId}`, { method: 'DELETE' });
      setSchedules((old) => old?.filter((entry) => entry.scriptId !== scriptId));
      setRemoving(undefined);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor?.scriptId || busy || (calendar && !calendarValid)) return;
    const timing = calendar ? { calendar } : { intervalMinutes: Number(editor.minutes) };
    void save(editor.scriptId, { ...timing, enabled: editor.enabled });
  }

  return (
    <section className="sr-panel" aria-label="Schedules">
      <header className="sr-panel-header">
        <div>
          <CalendarClock size={17} aria-hidden="true" />
          <h2>Schedules</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!schedules || !available.length || busy}
          onClick={() => {
            setActionError('');
            setEditor(editSchedule(available[0].id));
          }}
        >
          <Plus size={16} /> Add schedule
        </Button>
      </header>
      <div className="grid gap-3 p-3 sm:p-4">
        {!online && <p className="sr-muted">Schedules run when the Linux worker is online.</p>}
        {loadError && (
          <p className="sr-error" role="alert">
            {loadError}
          </p>
        )}
        {actionError && !editor && !removing && (
          <p className="sr-error" role="alert">
            {actionError}
          </p>
        )}
        {!schedules && !loadError && <p className="sr-muted">Loading schedules…</p>}
        {entries?.length === 0 && (
          <p className="sr-muted">
            {scripts.length ? 'No schedules yet.' : 'Save a script to schedule it.'}
          </p>
        )}
        {entries?.length ? (
          <ul className="divide-y divide-[var(--sr-edge)] rounded-md border border-[var(--sr-edge)]">
            {entries.map(({ schedule, script }) => (
              <li key={script.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 p-3">
                <div className="grid min-w-0 flex-[1_1_14rem] gap-1">
                  <strong className="break-words text-sm">{script.title}</strong>
                  <p className="sr-muted">
                    {'calendar' in schedule
                      ? `${schedule.calendar.frequency === 'weekdays' ? 'Weekdays' : 'Every day'} at ${schedule.calendar.time} · ${schedule.calendar.timeZone}`
                      : intervalLabel(schedule.intervalMinutes)}{' '}
                    · {schedule.enabled ? 'Enabled' : 'Paused'}
                  </p>
                  {schedule.enabled && schedule.nextRunAt && (
                    <p className="sr-muted">
                      Next run{' '}
                      <time dateTime={schedule.nextRunAt}>
                        {localTime(
                          schedule.nextRunAt,
                          'calendar' in schedule ? schedule.calendar.timeZone : undefined
                        )}
                      </time>
                    </p>
                  )}
                  {schedule.lastOutcome && schedule.lastAttemptAt && (
                    <p className="sr-muted">
                      {outcomes[schedule.lastOutcome]} at{' '}
                      <time dateTime={schedule.lastAttemptAt}>
                        {localTime(schedule.lastAttemptAt)}
                      </time>
                      {schedule.lastError && ` · ${schedule.lastError}`}
                    </p>
                  )}
                </div>
                {schedule.enabled && schedule.nextRunAt && (
                  <ScheduleCountdown
                    key={schedule.nextRunAt}
                    nextRunAt={schedule.nextRunAt}
                    online={online}
                  />
                )}
                <div className="ms-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={`${schedule.enabled ? 'Pause' : 'Resume'} ${script.title} schedule`}
                    onClick={() => {
                      const timing =
                        'calendar' in schedule
                          ? { calendar: schedule.calendar }
                          : { intervalMinutes: schedule.intervalMinutes };
                      void save(script.id, { ...timing, enabled: !schedule.enabled });
                    }}
                  >
                    {schedule.enabled ? <Pause size={15} /> : <Play size={15} />}
                    {schedule.enabled ? 'Pause' : 'Resume'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    aria-label={`Edit ${script.title} schedule`}
                    onClick={() => {
                      setActionError('');
                      setEditor(editSchedule(script.id, schedule));
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    aria-label={`Delete ${script.title} schedule`}
                    onClick={() => {
                      setActionError('');
                      setRemoving(script);
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {editor && (
        <RunnerDialog
          title={editor.existing ? 'Edit schedule' : 'Add schedule'}
          busy={busy}
          onClose={() => setEditor(undefined)}
        >
          <form className="sr-dialog-form" onSubmit={submit}>
            <label className="sr-field">
              <span>Saved script</span>
              <select
                className="sr-input"
                value={editor.scriptId}
                disabled={editor.existing || busy}
                onChange={(event) => setEditor({ ...editor, scriptId: event.target.value })}
                required
              >
                {(editor.existing
                  ? scripts.filter(({ id }) => id === editor.scriptId)
                  : available
                ).map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="sr-field">
              <span>Repeat</span>
              <select
                className="sr-input"
                value={editor.kind}
                disabled={busy}
                onChange={(event) =>
                  setEditor({ ...editor, kind: event.target.value as Editor['kind'] })
                }
              >
                <option value="interval">At an interval</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
              </select>
            </label>
            {editor.kind === 'interval' ? (
              <label className="sr-field">
                <span>Interval in minutes</span>
                <input
                  className="sr-input"
                  type="number"
                  min={SCHEDULE_MINUTES_STEP}
                  step={SCHEDULE_MINUTES_STEP}
                  max={SCHEDULE_MAX_MINUTES}
                  disabled={busy}
                  value={editor.minutes}
                  required
                  onChange={(event) => setEditor({ ...editor, minutes: event.target.value })}
                />
              </label>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-[2fr_3fr]">
                  <label className="sr-field">
                    <span>Local time</span>
                    <input
                      className="sr-input"
                      type="time"
                      value={editor.time}
                      required
                      disabled={busy}
                      onChange={(event) => setEditor({ ...editor, time: event.target.value })}
                    />
                  </label>
                  <label className="sr-field">
                    <span>Timezone</span>
                    <input
                      className="sr-input"
                      list={timeZoneList}
                      value={editor.timeZone}
                      required
                      maxLength={100}
                      spellCheck={false}
                      disabled={busy}
                      onChange={(event) => setEditor({ ...editor, timeZone: event.target.value })}
                    />
                  </label>
                  <datalist id={timeZoneList}>
                    {['UTC', ...(Intl.supportedValuesOf?.('timeZone') ?? [])].map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                </div>
                {calendar && upcoming.length > 0 && (
                  <div className="grid gap-1 rounded-md border border-[var(--sr-edge)] p-3 text-sm">
                    <strong>
                      {editor.enabled ? 'Next three runs' : 'Next three runs when resumed'}
                    </strong>
                    <ol aria-label="Upcoming runs" className="grid gap-1 text-muted-foreground">
                      {upcoming.map((date) => (
                        <li key={date}>
                          <time dateTime={date}>{localTime(date, calendar.timeZone)}</time>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {calendar && editor.timeZone && !isNamedTimeZone(calendar.timeZone) && (
                  <p className="sr-muted">Enter a timezone such as Asia/Kolkata or UTC.</p>
                )}
              </>
            )}
            <p className="sr-muted">Runs use the latest saved script and run defaults.</p>
            {actionError && (
              <p className="sr-error" role="alert">
                {actionError}
              </p>
            )}
            <footer className="sr-dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditor(undefined)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!!calendar && !calendarValid}>
                Save schedule
              </Button>
            </footer>
          </form>
        </RunnerDialog>
      )}
      {removing && (
        <RunnerDialog title="Delete schedule?" busy={busy} onClose={() => setRemoving(undefined)}>
          <div className="sr-dialog-form">
            <p className="sr-muted">Remove automatic runs for {removing.title}.</p>
            {actionError && (
              <p className="sr-error" role="alert">
                {actionError}
              </p>
            )}
            <footer className="sr-dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setRemoving(undefined)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                loading={busy}
                onClick={() => void remove(removing.id)}
              >
                Delete schedule
              </Button>
            </footer>
          </div>
        </RunnerDialog>
      )}
    </section>
  );
}
