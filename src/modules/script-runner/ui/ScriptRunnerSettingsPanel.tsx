'use client';

import { useId, useState, type FormEvent } from 'react';
import { Activity, Check, Circle, FolderOpen, Save, Settings2, SquareTerminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCRIPT_RUNTIMES, type ScriptLanguage, type ScriptRunnerDefaults } from '../types';
import { errorMessage, runnerRequest } from './client';

const numericFields = [
  { name: 'defaultTimeoutSeconds', label: 'Default timeout', unit: 'Seconds', max: 86_400 },
  { name: 'maxConcurrentRuns', label: 'Max concurrent runs', unit: 'Runs', max: 8 },
  { name: 'logRetentionDays', label: 'Log retention', unit: 'Days', max: 365 },
] as const;

export default function ScriptRunnerSettingsPanel({
  settings,
  online,
  supported,
  runtimes,
  onSaved,
}: {
  settings: ScriptRunnerDefaults;
  online: boolean;
  supported: boolean;
  runtimes: ScriptLanguage[];
  onSaved: (settings: ScriptRunnerDefaults) => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState<Partial<Record<keyof ScriptRunnerDefaults, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const directory = draft.defaultWorkingDirectory ?? settings.defaultWorkingDirectory;
  const changed =
    directory !== settings.defaultWorkingDirectory ||
    numericFields.some(
      ({ name }) => (draft[name] ?? String(settings[name])) !== String(settings[name])
    );
  const workerLabel = supported ? (online ? 'Online' : 'Offline') : 'Unavailable';

  function edit(key: keyof ScriptRunnerDefaults, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setError('');
    setSaved(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !changed) return;
    if (!directory.startsWith('/')) {
      setError('Enter an absolute working directory such as /srv/scripts.');
      return;
    }
    const update: Partial<ScriptRunnerDefaults> = {};
    if (directory !== settings.defaultWorkingDirectory) update.defaultWorkingDirectory = directory;
    for (const field of numericFields) {
      const value = Number(draft[field.name] ?? settings[field.name]);
      if (!Number.isInteger(value) || value < 1 || value > field.max) {
        setError(`${field.label} must be a whole number from 1 to ${field.max.toLocaleString()}.`);
        return;
      }
      if (value !== settings[field.name]) update[field.name] = value;
    }
    if (Object.keys(update).length === 0) {
      setDraft({});
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result = await runnerRequest<ScriptRunnerDefaults>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(update),
      });
      onSaved(result);
      setDraft({});
      setSaved(true);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 items-start gap-3.5 lg:grid-cols-[minmax(0,3fr)_minmax(240px,2fr)]">
      <section className="sr-panel" aria-label="Script Runner settings">
        <header className="sr-panel-header">
          <div>
            <Settings2 size={17} aria-hidden="true" />
            <h2>Runner defaults</h2>
          </div>
        </header>
        <form className="grid gap-5 p-3 sm:p-4" onSubmit={save}>
          <div className="sr-field">
            <label
              htmlFor={`${fieldId}-directory`}
              className="flex items-center gap-2 font-semibold"
            >
              <FolderOpen size={15} aria-hidden="true" /> Default working directory
            </label>
            <input
              id={`${fieldId}-directory`}
              className="sr-input sr-mono"
              value={directory}
              onChange={(event) => edit('defaultWorkingDirectory', event.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="/srv/scripts"
              maxLength={4096}
              required
              disabled={busy}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {numericFields.map(({ name, label, unit, max }) => (
              <div key={name} className="sr-field">
                <label htmlFor={`${fieldId}-${name}`} className="font-semibold">
                  {label}
                </label>
                <div className="relative">
                  <input
                    id={`${fieldId}-${name}`}
                    aria-describedby={`${fieldId}-${name}-unit`}
                    className="sr-input sr-mono appearance-none pr-16! [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    type="number"
                    min={1}
                    max={max}
                    step={1}
                    required
                    value={draft[name] ?? settings[name]}
                    onChange={(event) => edit(name, event.target.value)}
                    disabled={busy}
                  />
                  <span
                    id={`${fieldId}-${name}-unit`}
                    className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                  >
                    {unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="sr-muted">
            Log retention starts when a run finishes. Its history remains available after the output
            expires.
          </p>
          {error && (
            <p className="sr-error" role="alert">
              {error}
            </p>
          )}
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--sr-edge)] pt-3">
            {saved && (
              <p className="sr-muted me-auto! flex items-center gap-1.5" role="status">
                <Check size={15} className="text-[var(--sr-green)]" aria-hidden="true" /> Settings
                saved.
              </p>
            )}
            <Button type="submit" className="sr-run-button" loading={busy} disabled={!changed}>
              {!busy && <Save size={15} />} Save settings
            </Button>
          </footer>
        </form>
      </section>
      <section className="sr-panel" aria-label="Worker status">
        <header className="sr-panel-header">
          <div>
            <Activity size={17} aria-hidden="true" />
            <h2>Worker status</h2>
          </div>
          <span className={`sr-worker${supported && online ? ' sr-worker-online' : ''}`}>
            <Circle size={8} fill="currentColor" aria-hidden="true" /> {workerLabel}
          </span>
        </header>
        <div className="grid gap-3 p-3 sm:p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <SquareTerminal size={15} className="text-muted-foreground" aria-hidden="true" />{' '}
            Available runtimes
          </h3>
          {runtimes.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Available runtimes">
              {runtimes.map((runtime) => (
                <li
                  key={runtime}
                  className="sr-mono rounded-md border border-[var(--sr-edge)] bg-[var(--sr-inset)] px-2.5 py-1.5"
                >
                  {SCRIPT_RUNTIMES[runtime].label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sr-muted">
              {!supported
                ? 'Script execution requires a Linux worker.'
                : online
                  ? 'No runtimes detected.'
                  : 'Runtime status unavailable.'}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
