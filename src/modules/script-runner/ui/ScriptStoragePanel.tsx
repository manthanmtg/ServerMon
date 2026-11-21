'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/utils';
import {
  MAX_HISTORY_RETENTION_DAYS,
  MAX_HISTORY_RUNS,
  type ScriptRetention,
  type ScriptRunnerDefaults,
  type ScriptStorageUsage,
} from '../types';
import { errorMessage, runnerRequest } from './client';
import RunnerDialog from './RunnerDialog';

const limits = [
  { name: 'logRetentionDays', label: 'Log retention (days)', max: 365 },
  {
    name: 'historyRetentionDays',
    label: 'History retention (days)',
    max: MAX_HISTORY_RETENTION_DAYS,
  },
  { name: 'maxHistoryRuns', label: 'Maximum completed runs', max: MAX_HISTORY_RUNS },
] as const;

function RetentionDialog({
  row,
  settings,
  onClose,
  onSaved,
}: {
  row: ScriptStorageUsage;
  settings: ScriptRunnerDefaults;
  onClose: () => void;
  onSaved: (retention: ScriptRetention) => void;
}) {
  const [draft, setDraft] = useState<Partial<Record<keyof ScriptRetention, string>>>(() => ({
    logRetentionDays: row.retention?.logRetentionDays?.toString(),
    historyRetentionDays: row.retention?.historyRetentionDays?.toString(),
    maxHistoryRuns: row.retention?.maxHistoryRuns?.toString(),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const retention: ScriptRetention = {};
    for (const { name } of limits) {
      if (draft[name]) retention[name] = Number(draft[name]);
    }
    setBusy(true);
    setError('');
    try {
      const updated = await runnerRequest<ScriptRetention>(`/storage/${row.scriptId}`, {
        method: 'PUT',
        body: JSON.stringify(retention),
      });
      onSaved(updated);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RunnerDialog title="Script retention" busy={busy} onClose={onClose}>
      <form className="sr-dialog-form" onSubmit={save}>
        <p className="break-words text-sm font-semibold">{row.title}</p>
        <p className="sr-muted">
          Leave a field blank to inherit the runner default. The runner-wide limits always apply.
        </p>
        <div className="grid gap-3">
          {limits.map(({ name, label, max }) => (
            <label key={name} className="sr-field">
              <span>{label}</span>
              <input
                className="sr-input sr-mono"
                type="number"
                min={1}
                max={max}
                step={1}
                value={draft[name] ?? ''}
                placeholder={String(settings[name])}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
              />
            </label>
          ))}
        </div>
        {error && (
          <p className="sr-error" role="alert">
            {error}
          </p>
        )}
        <footer className="sr-dialog-actions">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save retention
          </Button>
        </footer>
      </form>
    </RunnerDialog>
  );
}

export default function ScriptStoragePanel({ settings }: { settings: ScriptRunnerDefaults }) {
  const [rows, setRows] = useState<ScriptStorageUsage[]>();
  const [editing, setEditing] = useState<ScriptStorageUsage>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    runnerRequest<ScriptStorageUsage[]>('/storage', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result);
          setError('');
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [refresh]);

  return (
    <section className="sr-panel" aria-label="Storage by script" aria-busy={busy}>
      <header className="sr-panel-header">
        <div>
          <HardDrive size={17} aria-hidden="true" />
          <h2>Storage by script</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={busy}
          onClick={() => {
            setBusy(true);
            setRefresh(refresh + 1);
          }}
        >
          <RefreshCw size={15} /> Refresh usage
        </Button>
      </header>
      <div className="grid gap-3 p-3 sm:p-4">
        <p className="sr-muted">
          Usage includes completed run records and their retained output files.
        </p>
        {error && (
          <p className="sr-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="sr-muted" role="status">
            {notice}
          </p>
        )}
        {!rows && busy && (
          <p className="sr-muted" role="status">
            Loading storage usage…
          </p>
        )}
        {rows?.length === 0 && (
          <p className="sr-muted">Saved scripts and completed runs will appear here.</p>
        )}
        {!!rows?.length && (
          <ul className="divide-y divide-[var(--sr-edge)] rounded-md border border-[var(--sr-edge)]">
            {rows.map((row) => (
              <li
                key={row.scriptId ?? 'other'}
                className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
              >
                <strong className="min-w-0 break-words text-sm">{row.title}</strong>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                  <span>
                    {row.retainedRuns} {row.retainedRuns === 1 ? 'run' : 'runs'}
                  </span>
                  <span>{formatBytes(row.logBytes)} of logs</span>
                </div>
                {row.scriptId && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sr-muted">
                      {row.retention && Object.keys(row.retention).length
                        ? `${Math.min(row.retention.logRetentionDays ?? settings.logRetentionDays, settings.logRetentionDays)}d logs · ${Math.min(row.retention.historyRetentionDays ?? settings.historyRetentionDays, settings.historyRetentionDays)}d history · ${Math.min(row.retention.maxHistoryRuns ?? settings.maxHistoryRuns, settings.maxHistoryRuns)} runs max`
                        : 'Runner defaults'}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Edit retention for ${row.title}`}
                      disabled={!!editing || busy}
                      onClick={() => {
                        setNotice('');
                        setEditing(row);
                      }}
                    >
                      Edit retention
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && (
        <RetentionDialog
          row={editing}
          settings={settings}
          onClose={() => setEditing(undefined)}
          onSaved={(retention) => {
            setRows((current) =>
              current?.map((row) =>
                row.scriptId === editing.scriptId ? { ...row, retention } : row
              )
            );
            setEditing(undefined);
            setNotice('Retention saved. The worker applies it during cleanup.');
          }}
        />
      )}
    </section>
  );
}
