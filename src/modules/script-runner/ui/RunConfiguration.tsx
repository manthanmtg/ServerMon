'use client';

import { useEffect, useId, useState } from 'react';
import {
  ArrowUp,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  KeyRound,
  Layers,
  Link2,
  Plus,
  Variable,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ENV_NAME_PATTERN,
  MAX_ENV_NAME_LENGTH,
  MAX_ENV_VALUE_LENGTH,
  MAX_ENV_VARS,
  type DirectoryListing,
  type EnvironmentLinks,
  type SavedEnvGroup,
  type SavedEnvVariable,
  type ScriptAttachment,
  type ScriptDraft,
  type ScriptEnvironmentVariable,
} from '../types';
import { errorMessage, runnerRequest } from './client';
import AttachmentsField from './AttachmentsField';

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

type Configuration = Pick<ScriptDraft, 'cwd' | 'args' | 'timeoutSeconds' | 'env' | 'attachments'> &
  EnvironmentLinks;

function environmentError(env: ScriptEnvironmentVariable[]) {
  if (env.some(({ key }) => !ENV_NAME_PATTERN.test(key))) {
    return 'Enter a variable name such as APP_MODE for each row.';
  }
  if (new Set(env.map(({ key }) => key)).size !== env.length) {
    return 'Each variable needs a unique name.';
  }
  return '';
}

export function validConfiguration(values: Configuration) {
  return (
    values.cwd.startsWith('/') &&
    Number.isInteger(values.timeoutSeconds) &&
    values.timeoutSeconds >= 1 &&
    values.timeoutSeconds <= 86_400 &&
    !environmentError(values.env)
  );
}

function EnvironmentFields({
  value,
  onChange,
  scope,
}: {
  value: ScriptEnvironmentVariable[];
  onChange: (entries: ScriptEnvironmentVariable[]) => void;
  scope: 'defaults' | 'run' | 'replay';
}) {
  const [show, setShow] = useState(false);
  const error = environmentError(value);
  function update(index: number, change: Partial<ScriptEnvironmentVariable>) {
    onChange(
      value.map((entry, position) => (position === index ? { ...entry, ...change } : entry))
    );
  }

  return (
    <fieldset className="sr-config-group sr-env">
      <legend>
        <Variable size={16} /> Environment variables
      </legend>
      <p className="sr-muted">
        {scope === 'defaults'
          ? 'Saved with this script. You can change them when launching a run.'
          : scope === 'run'
            ? 'Use Save defaults to keep these changes for future runs.'
            : 'Changes here apply to this run.'}
      </p>
      {value.length > 0 && (
        <div className="sr-env-columns">
          <span>Name</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShow(!show)}
            aria-pressed={show}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? 'Hide values' : 'Show values'}
          </Button>
        </div>
      )}
      {value.map(({ key, value: entry }, index) => {
        const multiline = entry.includes('\n') || entry.includes('\r');
        const label = `Variable ${index + 1} value`;
        return (
          <div key={index} className="sr-env-row">
            <input
              aria-label={`Variable ${index + 1} name`}
              className="sr-input sr-mono"
              value={key}
              maxLength={MAX_ENV_NAME_LENGTH}
              placeholder="APP_MODE"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => update(index, { key: event.currentTarget.value })}
            />
            {show ? (
              <textarea
                aria-label={label}
                className="sr-input sr-mono sr-env-value"
                value={entry}
                maxLength={MAX_ENV_VALUE_LENGTH}
                rows={2}
                spellCheck={false}
                onChange={(event) => update(index, { value: event.currentTarget.value })}
              />
            ) : (
              <input
                aria-label={label}
                className="sr-input sr-mono"
                type="password"
                value={multiline ? '' : entry}
                placeholder={multiline ? 'Multiline value' : 'Value'}
                readOnly={multiline}
                autoComplete="new-password"
                maxLength={MAX_ENV_VALUE_LENGTH}
                onChange={(event) => update(index, { value: event.currentTarget.value })}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove variable ${index + 1}`}
              onClick={() => onChange(value.filter((_, position) => position !== index))}
            >
              <X size={15} />
            </Button>
          </div>
        );
      })}
      {error && value.some(({ key }) => key) && (
        <p className="sr-field-error" role="status">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="sr-config-add"
        disabled={value.length >= MAX_ENV_VARS}
        onClick={() => onChange([...value, { key: '', value: '' }])}
      >
        <Plus size={15} /> Add variable
      </Button>
    </fieldset>
  );
}

function LinkedEnvironment({
  links,
  variables,
  groups,
  recordedKeys,
  onChange,
}: {
  links: EnvironmentLinks;
  variables: SavedEnvVariable[];
  groups: SavedEnvGroup[];
  recordedKeys?: string[];
  onChange: (links: EnvironmentLinks) => void;
}) {
  if (recordedKeys) {
    if (recordedKeys.length === 0) return null;
    return (
      <fieldset className="sr-config-group">
        <legend>
          <Link2 size={16} /> Recorded linked variables
        </legend>
        <p className="sr-muted">
          This run reuses the original values. An override below takes precedence.
        </p>
        <div className="sr-linked-list">
          {recordedKeys.map((key) => (
            <span key={key} className="sr-linked-token">
              <KeyRound size={13} /> {key}
            </span>
          ))}
        </div>
      </fieldset>
    );
  }

  const { envVarIds: ids = [], envGroupIds: groupIds = [] } = links;
  const linkedIds = new Set([
    ...ids,
    ...groups.filter((group) => groupIds.includes(group.id)).flatMap((group) => group.variableIds),
  ]);
  const available = variables.filter((variable) => !linkedIds.has(variable.id));
  const availableGroups = groups.filter((group) => !groupIds.includes(group.id));
  return (
    <fieldset className="sr-config-group">
      <legend>
        <Link2 size={16} /> Linked environment variables
      </legend>
      <p className="sr-muted">
        Link groups or individual variables from Env Vars. An override with the same name takes
        precedence.
      </p>
      {(ids.length > 0 || groupIds.length > 0) && (
        <div className="sr-linked-list">
          {groupIds.map((id) => {
            const group = groups.find((entry) => entry.id === id);
            return (
              <span className="sr-linked-token" key={id}>
                <Layers size={13} aria-label="Variable group" />
                {group?.name ?? 'Unavailable group'}
                <button
                  type="button"
                  aria-label={`Unlink group ${group?.name ?? 'unavailable'}`}
                  onClick={() => onChange({ envGroupIds: groupIds.filter((item) => item !== id) })}
                >
                  <X size={14} />
                </button>
              </span>
            );
          })}
          {ids.map((id) => {
            const variable = variables.find((entry) => entry.id === id);
            return (
              <span className="sr-linked-token" key={id}>
                {variable?.secret && <KeyRound size={13} />}
                {variable?.key ?? 'Unavailable variable'}
                <button
                  type="button"
                  aria-label={`Unlink ${variable?.key ?? 'unavailable variable'}`}
                  onClick={() => onChange({ envVarIds: ids.filter((item) => item !== id) })}
                >
                  <X size={14} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {availableGroups.length > 0 && groupIds.length < MAX_ENV_VARS && (
        <select
          aria-label="Link environment variable group"
          className="sr-input sr-link-select"
          value=""
          onChange={(event) => onChange({ envGroupIds: [...groupIds, event.currentTarget.value] })}
        >
          <option value="" disabled>
            Link a variable group…
          </option>
          {availableGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.variableIds.length})
            </option>
          ))}
        </select>
      )}
      {available.length > 0 && ids.length < MAX_ENV_VARS && (
        <select
          aria-label="Link saved environment variable"
          className="sr-input sr-mono sr-link-select"
          value=""
          onChange={(event) => onChange({ envVarIds: [...ids, event.currentTarget.value] })}
        >
          <option value="" disabled>
            Link a saved variable…
          </option>
          {available.map((variable) => (
            <option key={variable.id} value={variable.id}>
              {variable.key}
              {variable.secret ? ' (secret)' : ''}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  );
}

export default function RunConfiguration({
  value,
  onChange,
  onAttachmentsChange,
  readingAttachments,
  onReadingAttachmentsChange,
  recent,
  variables,
  groups,
  recordedKeys,
  scope,
}: {
  value: Configuration;
  onChange: (value: Configuration) => void;
  onAttachmentsChange: (files: ScriptAttachment[]) => void;
  readingAttachments: boolean;
  onReadingAttachmentsChange: (reading: boolean) => void;
  recent: string[];
  variables: SavedEnvVariable[];
  groups: SavedEnvGroup[];
  recordedKeys?: string[];
  scope: 'defaults' | 'run' | 'replay';
}) {
  const cwdId = useId();
  const [browse, setBrowse] = useState(false);

  function selectDirectory(cwd: string) {
    onChange({ ...value, cwd });
    setBrowse(false);
  }

  return (
    <div className="sr-configuration">
      <AttachmentsField
        files={value.attachments ?? []}
        onChange={onAttachmentsChange}
        reading={readingAttachments}
        onReadingChange={onReadingAttachmentsChange}
      />
      <div className="sr-config-group sr-config-location">
        <div className="sr-fields">
          <label className="sr-field" htmlFor={cwdId}>
            <span>
              <FolderOpen size={15} />{' '}
              {value.attachments?.length
                ? 'Working directory without attachments'
                : 'Working directory'}
            </span>
          </label>
          <div className="sr-inline-input">
            <input
              id={cwdId}
              value={value.cwd}
              placeholder="/srv/project"
              maxLength={4096}
              required
              className="sr-input sr-mono"
              onChange={(event) => onChange({ ...value, cwd: event.currentTarget.value })}
            />
            <Button
              variant="outline"
              type="button"
              onClick={() => setBrowse(!browse)}
              aria-expanded={browse}
            >
              <FolderOpen size={15} /> Browse
            </Button>
          </div>
          {browse && <DirectoryPicker start={value.cwd} onSelect={selectDirectory} />}
          {recent.length > 0 && (
            <div className="sr-recent">
              <span>Recent</span>
              {recent.map((path) => (
                <button key={path} type="button" title={path} onClick={() => selectDirectory(path)}>
                  {path}
                </button>
              ))}
            </div>
          )}
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
            value={value.timeoutSeconds || ''}
            onChange={(event) =>
              onChange({ ...value, timeoutSeconds: Number(event.currentTarget.value) })
            }
          />
        </label>
      </div>
      <fieldset className="sr-config-group">
        <legend>Arguments</legend>
        {value.args.map((argument, index) => (
          <div className="sr-inline-input" key={index}>
            <span className="sr-arg-index">{index + 1}</span>
            <input
              className="sr-input sr-mono"
              aria-label={`Argument ${index + 1}`}
              value={argument}
              maxLength={2048}
              onChange={(event) => {
                const argument = event.currentTarget.value;
                onChange({
                  ...value,
                  args: value.args.map((item, position) => (position === index ? argument : item)),
                });
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label={`Remove argument ${index + 1}`}
              onClick={() =>
                onChange({ ...value, args: value.args.filter((_, position) => position !== index) })
              }
            >
              <X size={16} />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="sr-config-add"
          type="button"
          disabled={value.args.length >= 20}
          onClick={() => onChange({ ...value, args: [...value.args, ''] })}
        >
          <Plus size={15} /> Add argument
        </Button>
      </fieldset>
      <LinkedEnvironment
        links={value}
        variables={variables}
        groups={groups}
        recordedKeys={scope === 'replay' ? (recordedKeys ?? []) : undefined}
        onChange={(links) => onChange({ ...value, ...links })}
      />
      <EnvironmentFields
        value={value.env}
        onChange={(env) => onChange({ ...value, env })}
        scope={scope}
      />
    </div>
  );
}
