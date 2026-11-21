'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  Braces,
  Eye,
  EyeOff,
  Link2,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Trash2,
  Variable,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ENV_NAME_PATTERN,
  MAX_ENV_NAME_LENGTH,
  MAX_ENV_VALUE_LENGTH,
  type SavedEnvVariable,
  type SavedEnvVariableDetail,
} from '../types';
import { errorMessage, runnerRequest } from './client';
import RunnerDialog from './RunnerDialog';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function variablePath(id: string) {
  return `/env-vars/${encodeURIComponent(id)}`;
}

function EditVariableDialog({
  variable,
  onClose,
  onSaved,
}: {
  variable?: SavedEnvVariable;
  onClose: () => void;
  onSaved: () => void;
}) {
  const valueId = useId();
  const [key, setKey] = useState(variable?.key ?? '');
  const [secret, setSecret] = useState(variable?.secret ?? false);
  const [value, setValue] = useState('');
  const [detail, setDetail] = useState<SavedEnvVariableDetail>();
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const [reveal, setReveal] = useState(false);
  const id = variable?.id;
  const preserveSecret = detail?.secret && !replace;
  const replacementRequired = preserveSecret && !secret;
  const awaitingDetail = Boolean(variable && !detail);
  const masked = secret && !reveal;
  const multiline = /[\r\n]/.test(value);

  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    void runnerRequest<SavedEnvVariableDetail>(variablePath(id), { signal: abort.signal })
      .then((result) => {
        if (abort.signal.aborted) return;
        setKey(result.key);
        setSecret(result.secret);
        setValue(result.secret ? '' : (result.value ?? ''));
        setDetail(result);
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setLoadError(errorMessage(failure));
      });
    return () => abort.abort();
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || awaitingDetail || replacementRequired) return;
    if (!ENV_NAME_PATTERN.test(key.trim())) {
      setSaveError('Use letters, numbers and underscores. Start with a letter or underscore.');
      return;
    }
    setSaveError('');
    setBusy(true);
    const updateValue = !detail || (detail.secret ? replace : value !== detail.value);
    try {
      await runnerRequest(id ? variablePath(id) : '/env-vars', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ key: key.trim(), secret, ...(updateValue ? { value } : {}) }),
      });
      onSaved();
    } catch (failure) {
      setSaveError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <RunnerDialog
      title={variable ? 'Edit environment variable' : 'New environment variable'}
      onClose={onClose}
      busy={busy}
    >
      {awaitingDetail ? (
        <div className="sr-dialog-form">
          {loadError ? (
            <p className="sr-error" role="alert">
              {loadError}
            </p>
          ) : (
            <p className="sr-muted" role="status">
              Loading variable…
            </p>
          )}
        </div>
      ) : (
        <form className="sr-dialog-form" onSubmit={save}>
          <label className="sr-field">
            <span>Variable name</span>
            <input
              className="sr-input sr-mono"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              maxLength={MAX_ENV_NAME_LENGTH}
              placeholder="APP_MODE"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={busy}
            />
          </label>
          <label className="sr-check rounded-lg border border-[var(--sr-edge)] bg-[var(--sr-inset)] px-3 text-foreground">
            <input
              type="checkbox"
              checked={secret}
              onChange={(event) => {
                setSecret(event.target.checked);
                setReveal(false);
              }}
              disabled={busy}
            />
            <LockKeyhole size={14} aria-hidden="true" /> Store as a secret
          </label>
          {detail?.secret && (
            <label className="sr-check">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => {
                  setReplace(event.target.checked);
                  if (!event.target.checked) {
                    setValue('');
                    setReveal(false);
                  }
                }}
                disabled={busy}
              />
              Replace stored value
              {replacementRequired && <span>(required when switching to plain)</span>}
            </label>
          )}
          {!preserveSecret && (
            <div className="sr-field">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={valueId} className="font-semibold">
                  {detail?.secret ? 'New value' : 'Value'}
                </label>
                {secret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setReveal(!reveal)}
                    disabled={busy}
                  >
                    {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
                    {reveal ? 'Hide value' : 'Show value'}
                  </Button>
                )}
              </div>
              {masked ? (
                <input
                  id={valueId}
                  className="sr-input sr-mono"
                  type="password"
                  value={multiline ? '' : value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={multiline ? 'Multiline value' : 'Enter value'}
                  autoComplete="new-password"
                  maxLength={MAX_ENV_VALUE_LENGTH}
                  readOnly={multiline}
                  disabled={busy}
                />
              ) : (
                <textarea
                  id={valueId}
                  className="sr-input sr-mono pt-2!"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="Enter value"
                  maxLength={MAX_ENV_VALUE_LENGTH}
                  spellCheck={false}
                  rows={3}
                  disabled={busy}
                />
              )}
            </div>
          )}
          {saveError && (
            <p className="sr-error" role="alert">
              {saveError}
            </p>
          )}
          <footer className="sr-dialog-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="sr-run-button"
              loading={busy}
              disabled={replacementRequired}
            >
              Save variable
            </Button>
          </footer>
        </form>
      )}
    </RunnerDialog>
  );
}

function DeleteVariableDialog({
  variable,
  onClose,
  onDeleted,
}: {
  variable: SavedEnvVariable;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setError('');
    setBusy(true);
    try {
      await runnerRequest(variablePath(variable.id), { method: 'DELETE' });
      onDeleted();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <RunnerDialog title="Delete environment variable" onClose={onClose} busy={busy}>
      <div className="sr-dialog-form">
        <p className="text-sm">
          Permanently delete <code className="font-semibold break-all">{variable.key}</code> and its
          stored value?
        </p>
        {error && (
          <p className="sr-error" role="alert">
            {error}
          </p>
        )}
        <footer className="sr-dialog-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" loading={busy} onClick={remove}>
            Delete variable
          </Button>
        </footer>
      </div>
    </RunnerDialog>
  );
}

type VariableDialog =
  | { action: 'create' }
  | { action: 'edit' | 'delete'; variable: SavedEnvVariable };

export default function EnvironmentVariablesPanel({
  variables,
  loading,
  onChanged,
}: {
  variables: SavedEnvVariable[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<VariableDialog>();
  const [status, setStatus] = useState('');
  const query = search.trim().toLowerCase();
  const visibleVariables = variables.filter(({ key }) => key.toLowerCase().includes(query));

  function open(next: VariableDialog) {
    setStatus('');
    setDialog(next);
  }

  function changed(message: string) {
    setDialog(undefined);
    setStatus(message);
    onChanged();
  }

  return (
    <section className="sr-panel" aria-label="Environment variables" aria-busy={loading}>
      <header className="sr-panel-header">
        <div>
          <Variable size={17} aria-hidden="true" />
          <h2>Environment variables</h2>
        </div>
        <Button
          type="button"
          size="sm"
          className="sr-run-button shrink-0"
          onClick={() => open({ action: 'create' })}
        >
          <Plus size={15} /> New variable
        </Button>
      </header>
      <div className="grid gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
          <p className="sr-muted flex items-center gap-2">
            <Link2 size={16} className="shrink-0" aria-hidden="true" /> Link individual variables in
            Run defaults or add them to a group.
          </p>
          <label className="sr-search m-0! w-full sm:max-w-64">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search variables…"
              aria-label="Search variables"
            />
          </label>
        </div>
        {status && (
          <p className="sr-notice" role="status">
            {status}
          </p>
        )}
        <div className="overflow-hidden rounded-lg border border-[var(--sr-edge)] bg-[var(--sr-inset)]">
          {visibleVariables.length ? (
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Saved environment variables</caption>
              <thead className="border-b border-[var(--sr-edge)] text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium sm:px-4">
                    Name
                  </th>
                  <th scope="col" className="w-22 px-2 py-2.5 font-medium sm:w-29">
                    Type
                  </th>
                  <th scope="col" className="hidden w-35 px-2 py-2.5 font-medium md:table-cell">
                    Updated
                  </th>
                  <th scope="col" className="w-26 px-2 py-2.5 text-right font-medium sm:w-25">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sr-edge)]">
                {visibleVariables.map((variable) => (
                  <tr key={variable.id} className="transition-colors hover:bg-accent/35">
                    <th scope="row" className="px-3 py-2 font-medium sm:px-4">
                      <code className="sr-mono block wrap-anywhere" title={variable.key}>
                        {variable.key}
                      </code>
                      <time
                        className="mt-0.5 block text-xs text-muted-foreground md:hidden"
                        dateTime={variable.updatedAt}
                      >
                        {dateFormat.format(new Date(variable.updatedAt))}
                      </time>
                    </th>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--sr-edge)] bg-[var(--sr-surface)] px-1.5 py-1 text-xs text-muted-foreground">
                        {variable.secret ? (
                          <LockKeyhole size={12} aria-hidden="true" />
                        ) : (
                          <Braces size={12} aria-hidden="true" />
                        )}
                        {variable.secret ? 'Secret' : 'Plain'}
                      </span>
                    </td>
                    <td className="hidden px-2 py-2 text-xs text-muted-foreground md:table-cell">
                      <time dateTime={variable.updatedAt}>
                        {dateFormat.format(new Date(variable.updatedAt))}
                      </time>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${variable.key}`}
                          onClick={() => open({ action: 'edit', variable })}
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="hover:text-destructive"
                          aria-label={`Delete ${variable.key}`}
                          onClick={() => open({ action: 'delete', variable })}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sr-library-empty" role="status">
              {loading
                ? 'Loading variables…'
                : query
                  ? 'No variables match your search.'
                  : 'No saved environment variables yet.'}
            </p>
          )}
        </div>
      </div>
      {dialog?.action === 'delete' && (
        <DeleteVariableDialog
          variable={dialog.variable}
          onClose={() => setDialog(undefined)}
          onDeleted={() => changed('Environment variable deleted.')}
        />
      )}
      {dialog && dialog.action !== 'delete' && (
        <EditVariableDialog
          variable={dialog.action === 'edit' ? dialog.variable : undefined}
          onClose={() => setDialog(undefined)}
          onSaved={() =>
            changed(
              dialog.action === 'edit'
                ? 'Environment variable updated.'
                : 'Environment variable created.'
            )
          }
        />
      )}
    </section>
  );
}
