'use client';

import { useState, type FormEvent } from 'react';
import { Download, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RunnerDialog from '@/modules/script-runner/ui/RunnerDialog';
import type { PythonInterpreter, PythonInterpreterInstall } from '../types';

export default function PythonInterpretersPanel({
  interpreters,
  installs,
  online,
  onInstall,
}: {
  interpreters: PythonInterpreter[];
  installs: PythonInterpreterInstall[];
  online: boolean;
  onInstall: (version: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function show() {
    setVersion('');
    setError('');
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !online) return;
    const requested = version.trim();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onInstall(requested);
      setNotice(`Python ${requested} installation requested.`);
      setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not request the interpreter.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sr-panel" aria-label="Python interpreters">
      <header className="sr-panel-header flex-wrap">
        <div>
          <Terminal size={17} aria-hidden="true" />
          <h2>Python interpreters</h2>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!online} onClick={show}>
          <Download size={15} /> Install Python version
        </Button>
      </header>
      <div className="grid gap-3 p-3 sm:p-4">
        {notice && (
          <p className="sr-notice" role="status">
            {notice}
          </p>
        )}
        {interpreters.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Available interpreters">
            {interpreters.map(({ id, version }) => (
              <li className="rounded-md border border-[var(--sr-edge)] px-3 py-2 text-sm" key={id}>
                Python {version}{' '}
                <span className="sr-muted">· {id.startsWith('uv-') ? 'Managed by uv' : id}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sr-muted">No interpreters reported by the worker.</p>
        )}
        {!!installs.length && (
          <ul
            className="divide-y divide-[var(--sr-edge)] rounded-md border border-[var(--sr-edge)]"
            aria-label="Interpreter installs"
          >
            {installs.map((install) => (
              <li className="grid gap-1 p-3 text-sm" key={install.version}>
                <span>
                  Python {install.version}{' '}
                  <span className="sr-muted">
                    ·{' '}
                    {install.status === 'failed'
                      ? 'Install failed'
                      : install.status === 'installing'
                        ? 'Installing'
                        : 'Queued'}
                  </span>
                </span>
                {install.error && (
                  <details className="min-w-0">
                    <summary className="cursor-pointer text-muted-foreground">
                      Install details
                    </summary>
                    <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap wrap-anywhere text-xs">
                      {install.error}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {open && (
        <RunnerDialog title="Install Python version" busy={busy} onClose={() => setOpen(false)}>
          <form className="sr-dialog-form" onSubmit={submit}>
            <label className="sr-field">
              <span>Exact CPython version</span>
              <input
                className="sr-input sr-mono"
                value={version}
                maxLength={9}
                placeholder="3.12.16"
                required
                disabled={busy}
                autoComplete="off"
                onChange={(event) => setVersion(event.target.value)}
              />
            </label>
            <p className="sr-muted">
              The version appears in New environment after uv finishes installing it.
            </p>
            {error && (
              <p className="sr-error" role="alert">
                {error}
              </p>
            )}
            <footer className="sr-dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!version.trim() || !online}>
                Install
              </Button>
            </footer>
          </form>
        </RunnerDialog>
      )}
    </section>
  );
}
