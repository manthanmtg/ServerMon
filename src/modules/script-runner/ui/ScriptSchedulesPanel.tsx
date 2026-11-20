'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SCHEDULE_MAX_MINUTES,
  SCHEDULE_MINUTES_STEP,
  type ScriptSchedule,
  type ScriptSummary,
} from '../types';
import { errorMessage, runnerRequest } from './client';
import RunnerDialog from './RunnerDialog';

const outcomes = {
  pending: 'Queueing',
  queued: 'Queued',
  skipped: 'Skipped',
  failed: 'Could not queue',
};

type Editor = { scriptId: string; minutes: string; enabled: boolean; existing: boolean };

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

function localTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
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

  async function save(scriptId: string, intervalMinutes: number, enabled: boolean) {
    setBusy(true);
    setActionError('');
    try {
      const result = await runnerRequest<ScriptSchedule>(`/schedules/${scriptId}`, {
        method: 'PUT',
        body: JSON.stringify({ intervalMinutes, enabled }),
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
    if (editor?.scriptId && !busy)
      void save(editor.scriptId, Number(editor.minutes), editor.enabled);
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
            setEditor({ scriptId: available[0].id, minutes: '5', enabled: true, existing: false });
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
              <li
                key={script.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-3"
              >
                <div className="grid min-w-0 gap-1">
                  <strong className="break-words text-sm">{script.title}</strong>
                  <p className="sr-muted">
                    {intervalLabel(schedule.intervalMinutes)} ·{' '}
                    {schedule.enabled ? 'Enabled' : 'Paused'}
                  </p>
                  {schedule.enabled && schedule.nextRunAt && (
                    <p className="sr-muted">
                      Next run{' '}
                      <time dateTime={schedule.nextRunAt}>{localTime(schedule.nextRunAt)}</time>
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={`${schedule.enabled ? 'Pause' : 'Resume'} ${script.title} schedule`}
                    onClick={() =>
                      void save(script.id, schedule.intervalMinutes, !schedule.enabled)
                    }
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
                      setEditor({
                        scriptId: script.id,
                        minutes: String(schedule.intervalMinutes),
                        enabled: schedule.enabled,
                        existing: true,
                      });
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
            <p className="sr-muted">
              Use five-minute increments, up to 365 days. Runs use the latest saved script and run
              defaults.
            </p>
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
              <Button type="submit" loading={busy}>
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
