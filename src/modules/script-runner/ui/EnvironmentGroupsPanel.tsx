'use client';

import { useState, type FormEvent } from 'react';
import { ChevronRight, Layers, LockKeyhole, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MAX_ENV_GROUP_NAME_LENGTH,
  MAX_ENV_VARS,
  type SavedEnvGroup,
  type SavedEnvVariable,
} from '../types';
import { errorMessage, runnerRequest } from './client';
import RunnerDialog from './RunnerDialog';

type GroupAction = { type: 'create' } | { type: 'edit' | 'delete'; group: SavedEnvGroup };

function GroupDialog({
  action,
  variables,
  onClose,
  onDone,
}: {
  action: GroupAction;
  variables: SavedEnvVariable[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const group = action.type === 'create' ? undefined : action.group;
  const deleting = action.type === 'delete';
  const [name, setName] = useState(group?.name ?? '');
  const [members, setMembers] = useState(group?.variableIds ?? []);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const matching = variables.filter(({ key }) =>
    key.toLowerCase().includes(search.trim().toLowerCase())
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (!deleting && (!name.trim() || !members.length))) return;
    setError('');
    setBusy(true);
    try {
      await runnerRequest(group ? `/env-groups/${group.id}` : '/env-groups', {
        method: deleting ? 'DELETE' : group ? 'PATCH' : 'POST',
        ...(deleting ? {} : { body: JSON.stringify({ name, variableIds: members }) }),
      });
      onDone(deleting ? 'Variable group deleted.' : 'Variable group saved.');
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <RunnerDialog
      title={
        deleting ? 'Delete variable group' : group ? 'Edit variable group' : 'New variable group'
      }
      onClose={onClose}
      busy={busy}
    >
      <form className="sr-dialog-form" onSubmit={submit}>
        {deleting ? (
          <p className="text-sm">
            Delete <strong>{group?.name}</strong>? Its variables will stay in Env Vars.
          </p>
        ) : (
          <>
            <label className="sr-field">
              <span>Group name</span>
              <input
                className="sr-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={MAX_ENV_GROUP_NAME_LENGTH}
                placeholder="Weather Telegram bot"
                required
                disabled={busy}
              />
            </label>
            <fieldset className="grid min-w-0 gap-2" disabled={busy}>
              <legend className="mb-2 text-sm font-semibold">Saved variables</legend>
              <label className="sr-search m-0!">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Find variables for this group"
                  placeholder="Find variables…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="max-h-48 overflow-auto rounded-md border border-[var(--sr-edge)]">
                {matching.length ? (
                  matching.map((variable) => (
                    <label
                      key={variable.id}
                      className="sr-check border-b border-[var(--sr-edge)] px-3 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={members.includes(variable.id)}
                        disabled={!members.includes(variable.id) && members.length >= MAX_ENV_VARS}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setMembers((current) =>
                            checked
                              ? [...current, variable.id]
                              : current.filter((id) => id !== variable.id)
                          );
                        }}
                      />
                      <code className="sr-mono min-w-0 wrap-anywhere text-foreground">
                        {variable.key}
                      </code>
                      {variable.secret && (
                        <LockKeyhole size={13} className="shrink-0" aria-label="Secret" />
                      )}
                    </label>
                  ))
                ) : (
                  <p className="sr-muted p-3">No matching variables.</p>
                )}
              </div>
              <p className="sr-muted" role="status">
                {members.length} of {MAX_ENV_VARS} selected
              </p>
            </fieldset>
          </>
        )}
        {error && (
          <p className="sr-error" role="alert">
            {error}
          </p>
        )}
        <footer className="sr-dialog-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={deleting ? 'destructive' : 'default'}
            loading={busy}
            disabled={!deleting && (!name.trim() || members.length === 0)}
          >
            {deleting ? 'Delete group' : 'Save group'}
          </Button>
        </footer>
      </form>
    </RunnerDialog>
  );
}

export default function EnvironmentGroupsPanel({
  groups,
  variables,
  loading,
  onChanged,
}: {
  groups: SavedEnvGroup[];
  variables: SavedEnvVariable[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<GroupAction>();
  const [notice, setNotice] = useState('');
  const byId = new Map(variables.map((variable) => [variable.id, variable]));

  function open(next: GroupAction) {
    setNotice('');
    setAction(next);
  }

  return (
    <section className="sr-panel" aria-label="Variable groups" aria-busy={loading}>
      <header className="sr-panel-header">
        <div>
          <Layers size={17} aria-hidden="true" />
          <h2>Variable groups</h2>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={loading || variables.length === 0}
          onClick={() => open({ type: 'create' })}
        >
          <Plus size={15} /> New group
        </Button>
      </header>
      <div className="grid gap-3 p-3 sm:p-4">
        {notice && (
          <p className="sr-notice" role="status">
            {notice}
          </p>
        )}
        {groups.length ? (
          <ul className="divide-y divide-[var(--sr-edge)] rounded-md border border-[var(--sr-edge)]">
            {groups.map((group) => (
              <li key={group.id} className="flex items-start gap-1 px-2 py-1.5 sm:px-3">
                <details className="group min-w-0 flex-1">
                  <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 py-2 pr-1">
                    <ChevronRight
                      size={15}
                      className="shrink-0 text-muted-foreground group-open:rotate-90"
                      aria-hidden="true"
                    />
                    <strong className="min-w-0 wrap-anywhere text-sm">{group.name}</strong>
                    <span className="sr-muted">
                      {group.variableIds.length}{' '}
                      {group.variableIds.length === 1 ? 'variable' : 'variables'}
                    </span>
                  </summary>
                  <ul
                    className="sr-linked-list px-2 pb-2"
                    aria-label={`Variables in ${group.name}`}
                  >
                    {group.variableIds.map((id) => {
                      const variable = byId.get(id);
                      return (
                        <li key={id} className="sr-linked-token">
                          {variable?.secret && <LockKeyhole size={13} aria-label="Secret" />}
                          {variable?.key ?? 'Unavailable variable'}
                        </li>
                      );
                    })}
                  </ul>
                </details>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Edit group ${group.name}`}
                  onClick={() => open({ type: 'edit', group })}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="hover:text-destructive"
                  aria-label={`Delete group ${group.name}`}
                  onClick={() => open({ type: 'delete', group })}
                >
                  <Trash2 size={15} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sr-muted">
            {loading
              ? 'Loading groups…'
              : variables.length
                ? 'Group saved variables to link them together in a script’s Run defaults.'
                : 'Save a variable to start building a group.'}
          </p>
        )}
      </div>
      {action && (
        <GroupDialog
          action={action}
          variables={variables}
          onClose={() => setAction(undefined)}
          onDone={(message) => {
            setAction(undefined);
            setNotice(message);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
