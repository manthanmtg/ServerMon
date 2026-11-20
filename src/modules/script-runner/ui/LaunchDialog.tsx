'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowUp,
  ChevronRight,
  Clock3,
  Folder,
  FolderOpen,
  Play,
  Plus,
  SquareTerminal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RUNNER_USER, type DirectoryListing, type ScriptDraft } from '../types';
import { errorMessage, runnerRequest } from './client';
import RunnerDialog from './RunnerDialog';

function DirectoryPicker({ start, onSelect }: { start: string; onSelect: (path: string) => void }) {
  const [path, setPath] = useState(start || '/');
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void runnerRequest<DirectoryListing>(`/directories?path=${encodeURIComponent(path)}`, {
      signal: abort.signal,
    })
      .then((result) => {
        setListing(result);
        setError('');
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) {
          setListing(null);
          setError(errorMessage(reason));
        }
      });
    return () => abort.abort();
  }, [path]);

  function visit(next: string) {
    setListing(null);
    setError('');
    setPath(next);
  }

  const current = listing?.path ?? path;
  return (
    <div className="sr-picker">
      <div className="sr-picker-heading">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Parent directory"
          disabled={current === '/'}
          onClick={() => visit(current.slice(0, current.lastIndexOf('/')) || '/')}
        >
          <ArrowUp size={15} />
        </Button>
        <span title={current}>{current}</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!listing}
          onClick={() => onSelect(current)}
        >
          Use directory
        </Button>
      </div>
      <div className="sr-picker-list">
        {error ? (
          <p role="status" className="sr-muted">
            {error}
          </p>
        ) : !listing ? (
          <p className="sr-muted">Loading directories…</p>
        ) : !listing.directories.length ? (
          <p className="sr-muted">No subdirectories</p>
        ) : (
          listing.directories.map((directory) => (
            <button type="button" key={directory} onClick={() => visit(directory)}>
              <Folder size={15} /> {directory.slice(directory.lastIndexOf('/') + 1)}{' '}
              <ChevronRight size={14} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function LaunchDialog({
  draft,
  recent,
  online,
  canSave,
  onClose,
  onLaunch,
}: {
  draft: ScriptDraft;
  recent: string[];
  online: boolean;
  canSave?: boolean;
  onClose: () => void;
  onLaunch: (draft: ScriptDraft, save: boolean) => Promise<void>;
}) {
  const [cwd, setCwd] = useState(draft.cwd);
  const [args, setArgs] = useState(draft.args);
  const [timeout, setTimeoutValue] = useState(String(draft.timeoutSeconds));
  const [browse, setBrowse] = useState(false);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onLaunch({ ...draft, cwd, args, timeoutSeconds: Number(timeout) }, save);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RunnerDialog title="Configure run" onClose={onClose} busy={busy}>
      <form className="sr-dialog-form" onSubmit={submit}>
        <div className="sr-launch-target">
          <SquareTerminal size={21} />
          <div>
            <strong>{draft.title}</strong>
            <span>Bash · Local files · Network off</span>
          </div>
          <code>{RUNNER_USER}</code>
        </div>
        <div className="sr-fields">
          <label className="sr-field" htmlFor="sr-cwd">
            <span>
              <FolderOpen size={15} /> Working directory
            </span>
          </label>
          <div className="sr-inline-input">
            <input
              id="sr-cwd"
              value={cwd}
              placeholder="/srv/project"
              maxLength={4096}
              required
              onChange={(event) => setCwd(event.target.value)}
              className="sr-input sr-mono"
            />
            <Button
              variant="outline"
              type="button"
              onClick={() => setBrowse(!browse)}
              aria-expanded={browse}
            >
              <FolderOpen size={16} /> Browse
            </Button>
          </div>
          {browse && (
            <DirectoryPicker
              start={cwd}
              onSelect={(selected) => {
                setCwd(selected);
                setBrowse(false);
              }}
            />
          )}
          {recent.length > 0 && (
            <div className="sr-recent">
              <span>Recent</span>
              {recent.map((path) => (
                <button
                  key={path}
                  type="button"
                  title={path}
                  onClick={() => {
                    setCwd(path);
                    setBrowse(false);
                  }}
                >
                  {path}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="sr-fields">
          <div className="sr-argument-heading">
            <span>
              Arguments <small>Optional</small>
            </span>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={args.length >= 20}
              onClick={() => setArgs([...args, ''])}
            >
              <Plus size={15} /> Add argument
            </Button>
          </div>
          {args.map((argument, index) => (
            <div className="sr-inline-input" key={index}>
              <span className="sr-arg-index">
                {'$'}
                {index + 1}
              </span>
              <input
                className="sr-input sr-mono"
                aria-label={`Argument ${index + 1}`}
                value={argument}
                maxLength={2048}
                onChange={(event) =>
                  setArgs(
                    args.map((item, position) => (position === index ? event.target.value : item))
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                aria-label={`Remove argument ${index + 1}`}
                onClick={() => setArgs(args.filter((_, position) => index !== position))}
              >
                <X size={16} />
              </Button>
            </div>
          ))}
        </div>
        <label className="sr-field">
          <span>
            <Clock3 size={15} /> Timeout in seconds
          </span>
          <input
            className="sr-input sr-timeout-input"
            type="number"
            required
            min={1}
            max={86_400}
            value={timeout}
            onChange={(event) => setTimeoutValue(event.target.value)}
          />
        </label>
        {canSave && (
          <label className="sr-check">
            <input
              type="checkbox"
              checked={save}
              onChange={(event) => setSave(event.target.checked)}
            />{' '}
            Save script and launch settings to the library
          </label>
        )}
        {!online && (
          <p className="sr-notice" role="status">
            The Linux script worker is offline.
          </p>
        )}
        {error && (
          <p className="sr-error" role="alert">
            {error}
          </p>
        )}
        <div className="sr-dialog-actions">
          <Button variant="outline" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="sr-run-button"
            loading={busy}
            disabled={!online || !cwd.startsWith('/')}
          >
            <Play size={16} fill="currentColor" /> {save ? 'Save & run' : 'Start run'}
          </Button>
        </div>
      </form>
    </RunnerDialog>
  );
}
