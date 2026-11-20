'use client';

import { useState, type FormEvent } from 'react';
import { Play, SquareTerminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  RUNNER_USER,
  SCRIPT_RUNTIMES,
  type SavedEnvVariable,
  type ScriptDraft,
  type ScriptLanguage,
} from '../types';
import { errorMessage } from './client';
import RunConfiguration, { validConfiguration } from './RunConfiguration';
import RunnerDialog from './RunnerDialog';

export default function LaunchDialog({
  draft,
  recent,
  online,
  runtimes,
  environmentSupport,
  variables,
  recordedKeys,
  canSave,
  onClose,
  onLaunch,
}: {
  draft: ScriptDraft;
  recent: string[];
  online: boolean;
  runtimes: ScriptLanguage[];
  environmentSupport: boolean;
  variables: SavedEnvVariable[];
  recordedKeys?: string[];
  canSave?: boolean;
  onClose: () => void;
  onLaunch: (draft: ScriptDraft, save: boolean) => Promise<void>;
}) {
  const [settings, setSettings] = useState(draft);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const runtime = SCRIPT_RUNTIMES[settings.language];
  const unavailable = !online
    ? 'The Linux script worker is offline.'
    : !runtimes.includes(settings.language)
      ? `${runtime.label} is unavailable on this worker.`
      : (settings.env.length > 0 || !!settings.envVarIds?.length || !!recordedKeys?.length) &&
          !environmentSupport
        ? 'Upgrade the Linux script worker to use environment variables.'
        : '';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unavailable || !validConfiguration(settings)) return;
    setBusy(true);
    setError('');
    try {
      await onLaunch(settings, save);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RunnerDialog title="Configure run" onClose={onClose} busy={busy}>
      <form className="sr-dialog-form sr-launch-form" onSubmit={submit}>
        <div className="sr-launch-target">
          <SquareTerminal size={21} />
          <div>
            <strong>{draft.title}</strong>
            <span>{runtime.label} · Local files · Network off</span>
          </div>
          <code>{RUNNER_USER}</code>
        </div>
        <fieldset disabled={busy} className="sr-launch-fields">
          <RunConfiguration
            value={settings}
            onChange={(configuration) =>
              setSettings((current) => ({ ...current, ...configuration }))
            }
            recent={recent}
            variables={variables}
            recordedKeys={recordedKeys}
            scope={canSave ? 'run' : 'replay'}
          />
        </fieldset>
        {unavailable && (
          <p className="sr-notice" role="status">
            {unavailable}
          </p>
        )}
        {error && (
          <p className="sr-error" role="alert">
            {error}
          </p>
        )}
        <footer className="sr-dialog-actions sr-launch-actions">
          {canSave && (
            <label className="sr-check">
              <input
                type="checkbox"
                checked={save}
                disabled={busy}
                onChange={(event) => setSave(event.currentTarget.checked)}
              />{' '}
              Save as script defaults
            </label>
          )}
          <div>
            <Button variant="outline" type="button" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="sr-run-button"
              loading={busy}
              disabled={!!unavailable || !validConfiguration(settings)}
            >
              <Play size={16} fill="currentColor" /> {save ? 'Save & run' : 'Start run'}
            </Button>
          </div>
        </footer>
      </form>
    </RunnerDialog>
  );
}
