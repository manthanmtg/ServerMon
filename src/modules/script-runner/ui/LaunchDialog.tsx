'use client';

import { useState, type FormEvent } from 'react';
import { Play, SquareTerminal } from 'lucide-react';
import type {
  PythonEnvironmentOption,
  PythonEnvironmentSelection,
} from '@/modules/python-environments/types';
import { Button } from '@/components/ui/button';
import {
  RUNNER_USER,
  SCRIPT_RUNTIMES,
  type SavedEnvGroup,
  type SavedEnvVariable,
  type ScriptDraft,
  type ScriptLanguage,
} from '../types';
import { errorMessage } from './client';
import RunConfiguration, { validConfiguration } from './RunConfiguration';
import RunnerDialog from './RunnerDialog';
import PythonEnvironmentField from './PythonEnvironmentField';

export default function LaunchDialog({
  draft,
  recent,
  online,
  runtimes,
  environmentSupport,
  attachmentSupport,
  pythonEnvironmentSupport,
  pythonEnvironments,
  recordedPythonEnvironment,
  variables,
  groups,
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
  attachmentSupport?: boolean;
  pythonEnvironmentSupport?: boolean;
  pythonEnvironments: PythonEnvironmentOption[];
  recordedPythonEnvironment?: PythonEnvironmentSelection;
  variables: SavedEnvVariable[];
  groups: SavedEnvGroup[];
  recordedKeys?: string[];
  canSave?: boolean;
  onClose: () => void;
  onLaunch: (draft: ScriptDraft, save: boolean) => Promise<void>;
}) {
  const [settings, setSettings] = useState(draft);
  const [readingAttachments, setReadingAttachments] = useState(false);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const runtime = SCRIPT_RUNTIMES[settings.language];
  const unavailable = !online
    ? 'The Linux script worker is offline.'
    : !runtimes.includes(settings.language)
      ? `${runtime.label} is unavailable on this worker.`
      : (settings.pythonEnvironmentId || recordedPythonEnvironment) && !pythonEnvironmentSupport
        ? 'Upgrade the Linux script worker to use Python environments.'
        : settings.attachments?.length && !attachmentSupport
          ? 'Upgrade the Linux script worker to use attachments.'
          : (settings.env.length > 0 ||
                !!settings.envVarIds?.length ||
                !!settings.envGroupIds?.length ||
                !!recordedKeys?.length) &&
              !environmentSupport
            ? 'Upgrade the Linux script worker to use environment variables.'
            : '';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readingAttachments || unavailable || !validConfiguration(settings)) return;
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
            <span>{runtime.label} · Local files · Network enabled</span>
          </div>
          <code>{RUNNER_USER}</code>
        </div>
        <fieldset disabled={busy} className="sr-launch-fields">
          {settings.language === 'python' && (
            <PythonEnvironmentField
              options={pythonEnvironments}
              value={settings.pythonEnvironmentId}
              onChange={(pythonEnvironmentId) =>
                setSettings((current) => ({ ...current, pythonEnvironmentId }))
              }
              replay={!canSave}
              recorded={recordedPythonEnvironment}
            />
          )}
          <RunConfiguration
            value={settings}
            onChange={(configuration) =>
              setSettings((current) => ({ ...current, ...configuration }))
            }
            onAttachmentsChange={(attachments) =>
              setSettings((current) => ({ ...current, attachments }))
            }
            readingAttachments={readingAttachments}
            onReadingAttachmentsChange={setReadingAttachments}
            recent={recent}
            variables={variables}
            groups={groups}
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
              disabled={readingAttachments || !!unavailable || !validConfiguration(settings)}
            >
              <Play size={16} fill="currentColor" /> {save ? 'Save & run' : 'Start run'}
            </Button>
          </div>
        </footer>
      </form>
    </RunnerDialog>
  );
}
