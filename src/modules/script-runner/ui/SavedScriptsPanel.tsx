'use client';

import { useId, useState } from 'react';
import {
  ArrowUpRight,
  Clock3,
  Copy,
  FileCode2,
  Folder,
  FolderInput,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MAX_SCRIPT_FOLDER_LENGTH,
  SCRIPT_RUNTIMES,
  type SavedScript,
  type ScriptSummary,
} from '../types';
import { errorMessage, runnerRequest } from './client';
import RunnerDialog from './RunnerDialog';
import './script-runner-management.css';

type LibraryAction = { type: 'move' | 'delete'; script: ScriptSummary };

interface SavedScriptsPanelProps {
  scripts: ScriptSummary[];
  loading: boolean;
  onNew: () => void;
  onEdit: (id: string) => void;
  onChanged: () => void;
  onDeleted: (id: string) => void;
}

function runtimeLabel(script: ScriptSummary) {
  return SCRIPT_RUNTIMES[script.language ?? 'bash'].label;
}

function matchesQuery(script: ScriptSummary, query: string) {
  return [script.title, script.folder || 'Unfiled', runtimeLabel(script)].some((text) =>
    text.toLowerCase().includes(query)
  );
}

function copyTitle(title: string) {
  const suffix = ' (copy)';
  const limit = 80 - suffix.length;
  const lastCodeUnit = title.charCodeAt(limit - 1);
  const end = lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff ? limit - 1 : limit;
  return `${title.slice(0, end).trimEnd()}${suffix}`;
}

function ScriptSearch({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  return (
    <label className="sr-search sr-script-search">
      <Search size={16} aria-hidden="true" />
      <span className="sr-only">Search saved scripts</span>
      <input
        type="search"
        placeholder="Search saved scripts…"
        value={query}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export function OpenSavedScriptDialog({
  scripts,
  onSelect,
  onClose,
}: {
  scripts: ScriptSummary[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const results = scripts.filter((script) => matchesQuery(script, normalized));

  return (
    <RunnerDialog title="Open saved script" onClose={onClose}>
      <div className="sr-dialog-form">
        <ScriptSearch query={query} onChange={setQuery} />
        {results.length ? (
          <ul className="sr-script-picker" role="list" aria-label="Saved scripts">
            {results.map((script) => (
              <li key={script.id}>
                <button
                  className="sr-library-item"
                  type="button"
                  onClick={() => onSelect(script.id)}
                >
                  <FileCode2 size={16} aria-hidden="true" />
                  <span>
                    <strong>{script.title}</strong>
                    <small>
                      {runtimeLabel(script)} · {script.folder || 'Unfiled'}
                    </small>
                  </span>
                  <ArrowUpRight className="sr-management-arrow" size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sr-management-empty" role="status">
            {scripts.length ? 'No scripts match your search.' : 'No saved scripts yet.'}
          </p>
        )}
      </div>
    </RunnerDialog>
  );
}

export default function SavedScriptsPanel({
  scripts,
  loading,
  onNew,
  onEdit,
  onChanged,
  onDeleted,
}: SavedScriptsPanelProps) {
  const [query, setQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [action, setAction] = useState<LibraryAction | null>(null);
  const [folderName, setFolderName] = useState('');
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const folderListId = useId();

  const folders = [...new Set(scripts.flatMap(({ folder }) => (folder ? [folder] : [])))].sort(
    (left, right) => left.localeCompare(right)
  );
  const folderOptions = ['', ...folders];
  const selectedFolder = folderFilter.slice('folder:'.length);
  if (folderFilter && !folderOptions.includes(selectedFolder)) folderOptions.push(selectedFolder);

  const normalized = query.trim().toLowerCase();
  const results = scripts.filter(
    (script) =>
      (!folderFilter || (script.folder ?? '') === selectedFolder) &&
      matchesQuery(script, normalized)
  );

  async function duplicate(scriptId: string) {
    if (busyId) return;
    setBusyId(scriptId);
    setError('');
    setNotice('');
    try {
      const { title, source, language, env, cwd, args, timeoutSeconds, folder, envVarIds } =
        await runnerRequest<SavedScript>(`/scripts/${scriptId}`);
      const duplicate = await runnerRequest<SavedScript>('/scripts', {
        method: 'POST',
        body: JSON.stringify({
          title: copyTitle(title),
          source,
          language,
          env,
          cwd,
          args,
          timeoutSeconds,
          folder,
          envVarIds,
        }),
      });
      onChanged();
      setNotice(`Created “${duplicate.title}”.`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusyId(undefined);
    }
  }

  function openAction(type: LibraryAction['type'], script: ScriptSummary) {
    setError('');
    setNotice('');
    setFolderName(script.folder ?? '');
    setAction({ type, script });
  }

  function closeAction() {
    setError('');
    setAction(null);
  }

  async function confirmAction() {
    if (!action || busyId) return;
    const { type, script } = action;
    setBusyId(script.id);
    setError('');
    try {
      if (type === 'move') {
        const folder = folderName.trim();
        await runnerRequest(`/scripts/${script.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ folder }),
        });
        onChanged();
        setNotice(
          folder ? `Moved “${script.title}” to “${folder}”.` : `Unfiled “${script.title}”.`
        );
      } else {
        await runnerRequest(`/scripts/${script.id}`, { method: 'DELETE' });
        onDeleted(script.id);
        onChanged();
        setNotice(`Deleted “${script.title}”.`);
      }
      closeAction();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="sr-panel sr-saved-scripts" aria-label="Saved scripts">
      <header className="sr-panel-header sr-management-header">
        <div>
          <Folder size={17} aria-hidden="true" />
          <h2>Saved scripts</h2>
        </div>
        <Button className="sr-management-button sr-run-button" type="button" onClick={onNew}>
          <Plus size={16} aria-hidden="true" /> New script
        </Button>
      </header>

      <div className="sr-saved-toolbar">
        <ScriptSearch query={query} onChange={setQuery} />
        <label className="sr-saved-folder-filter">
          <span className="sr-only">Filter by folder</span>
          <select
            className="sr-input"
            value={folderFilter}
            onChange={(event) => setFolderFilter(event.currentTarget.value)}
          >
            <option value="">All folders</option>
            {folderOptions.map((folder) => (
              <option key={folder} value={`folder:${folder}`}>
                {folder || 'Unfiled'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && !action && (
        <p className="sr-error sr-management-feedback" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="sr-notice sr-management-feedback" role="status">
          {notice}
        </p>
      )}

      {results.length ? (
        <>
          <div className="sr-saved-row sr-saved-column-headings" aria-hidden="true">
            <span>Script</span>
            <span>Folder</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>
          <ul className="sr-saved-list" role="list">
            {results.map((script) => (
              <li className="sr-saved-row" key={script.id}>
                <div className="sr-management-name">
                  <div className="sr-management-icon">
                    <FileCode2 size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <strong title={script.title}>{script.title}</strong>
                    <small>{runtimeLabel(script)}</small>
                  </div>
                </div>
                <span className="sr-saved-folder" title={script.folder || 'Unfiled'}>
                  <Folder size={15} aria-hidden="true" />
                  <span>{script.folder || 'Unfiled'}</span>
                </span>
                <time
                  className="sr-saved-date"
                  dateTime={script.updatedAt}
                  title={new Date(script.updatedAt).toLocaleString()}
                >
                  <Clock3 size={14} aria-hidden="true" />
                  {new Date(script.updatedAt).toLocaleDateString(undefined, {
                    dateStyle: 'medium',
                  })}
                </time>
                <div
                  className="sr-saved-actions"
                  role="group"
                  aria-label={`Actions for ${script.title}`}
                >
                  <Button
                    className="sr-management-button"
                    type="button"
                    variant="outline"
                    onClick={() => onEdit(script.id)}
                  >
                    Edit in Workspace <ArrowUpRight size={15} aria-hidden="true" />
                  </Button>
                  <Button
                    className="sr-management-button"
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Duplicate"
                    aria-label={`Duplicate ${script.title}`}
                    loading={busyId === script.id && !action}
                    disabled={!!busyId}
                    onClick={() => void duplicate(script.id)}
                  >
                    {busyId !== script.id && <Copy size={16} aria-hidden="true" />}
                  </Button>
                  <Button
                    className="sr-management-button"
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Move to folder"
                    aria-label={`Move ${script.title} to folder`}
                    disabled={!!busyId}
                    onClick={() => openAction('move', script)}
                  >
                    <FolderInput size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    className="sr-management-button sr-saved-delete"
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    aria-label={`Delete ${script.title}`}
                    disabled={!!busyId}
                    onClick={() => openAction('delete', script)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="sr-management-empty" role="status">
          {loading
            ? 'Loading saved scripts…'
            : normalized || folderFilter
              ? 'No scripts match your search or folder.'
              : 'No saved scripts yet.'}
        </p>
      )}

      {action && (
        <RunnerDialog
          title={action.type === 'move' ? 'Move to folder' : 'Delete saved script?'}
          onClose={closeAction}
          busy={!!busyId}
        >
          <form
            className="sr-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmAction();
            }}
          >
            {action.type === 'move' ? (
              <>
                <p className="sr-muted">
                  Choose or enter a folder for <strong>{action.script.title}</strong>.
                </p>
                <label className="sr-field">
                  <span>Folder name</span>
                  <input
                    className="sr-input sr-management-button"
                    list={folderListId}
                    maxLength={MAX_SCRIPT_FOLDER_LENGTH}
                    value={folderName}
                    placeholder="Unfiled"
                    onChange={(event) => setFolderName(event.currentTarget.value)}
                  />
                  <datalist id={folderListId}>
                    {folders.map((folder) => (
                      <option key={folder} value={folder} />
                    ))}
                  </datalist>
                </label>
                <p className="sr-muted">Leave the folder name empty to unfile this script.</p>
              </>
            ) : (
              <p className="sr-muted">
                <strong>{action.script.title}</strong> will be removed from the library. Existing
                runs stay in history.
              </p>
            )}
            {error && (
              <p className="sr-error" role="alert">
                {error}
              </p>
            )}
            <footer className="sr-dialog-actions">
              <Button
                className="sr-management-button"
                type="button"
                variant="outline"
                onClick={closeAction}
                disabled={!!busyId}
              >
                Cancel
              </Button>
              <Button
                className="sr-management-button"
                type="submit"
                variant={action.type === 'delete' ? 'destructive' : 'default'}
                loading={!!busyId}
                disabled={
                  action.type === 'move' && folderName.trim() === (action.script.folder ?? '')
                }
              >
                {action.type === 'delete' ? 'Delete script' : 'Move script'}
              </Button>
            </footer>
          </form>
        </RunnerDialog>
      )}
    </section>
  );
}
