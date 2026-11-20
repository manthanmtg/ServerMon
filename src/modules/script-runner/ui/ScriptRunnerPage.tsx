'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  Braces,
  Circle,
  Clock3,
  FileCode2,
  FolderOpen,
  History,
  ListRestart,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  SquareTerminal,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  DEFAULT_CWD,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_TIMEOUT_SECONDS,
  isActiveRun,
  type RunnerOverview,
  type SavedScript,
  type ScriptDraft,
  type ScriptRun,
} from '../types';
import { errorMessage, requestId, runnerRequest } from './client';
import BashLaunchDialog from './LaunchDialog';
import RunConsole, { elapsed, RunBadge } from './RunConsole';
import RunnerDialog from './RunnerDialog';
import './script-runner.css';

const BashEditor = dynamic(() => import('./BashEditor'), {
  ssr: false,
  loading: () => <div className="sr-editor sr-editor-loading">Loading Bash editor…</div>,
});

const starter: ScriptDraft = {
  title: 'Host snapshot',
  source:
    '#!/usr/bin/env bash\nset -euo pipefail\n\nprintf "Host: %s\\n" "$(hostname)"\nprintf "Working directory: %s\\n" "$PWD"\nprintf "\\nDisk usage\\n"\ndf -h .\n',
  cwd: DEFAULT_CWD,
  args: [],
  timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
};

const emptyDraft = {
  ...starter,
  title: 'Untitled script',
  source: '#!/usr/bin/env bash\nset -euo pipefail\n\n',
};

type Launch = { draft: ScriptDraft; scriptId?: string; replay?: boolean };
type Tab = 'active' | 'history';

function mergeHistory(recent: ScriptRun[], cached: ScriptRun[]): ScriptRun[] {
  const byId = new Map(cached.map((run) => [run.id, run]));
  for (const run of recent) byId.set(run.id, run);
  return Array.from(byId.values()).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  );
}

function RetentionDialog({
  days,
  onClose,
  onSave,
}: {
  days: number;
  onClose: () => void;
  onSave: (days: number) => void;
}) {
  const [value, setValue] = useState(String(days));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <RunnerDialog title="Script Runner settings" onClose={onClose} busy={busy}>
      <form
        className="sr-dialog-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError('');
          setBusy(true);
          try {
            const result = await runnerRequest<{ logRetentionDays: number }>('/settings', {
              method: 'PATCH',
              body: JSON.stringify({ logRetentionDays: Number(value) }),
            });
            onSave(result.logRetentionDays);
          } catch (failure) {
            setError(errorMessage(failure));
            setBusy(false);
          }
        }}
      >
        <label className="sr-field">
          <span>Log retention in days</span>
          <input
            className="sr-input sr-timeout-input"
            type="number"
            min={1}
            max={365}
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className="sr-muted">
          Measured from when a run finishes. Saved scripts and run history stay available after
          output expires.
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
          <Button type="submit" className="sr-run-button" loading={busy}>
            Save settings
          </Button>
        </footer>
      </form>
    </RunnerDialog>
  );
}

function RunList({
  active,
  history,
  historyCursor,
  historyBusy,
  selectedId,
  onSelect,
  onMore,
  onRerun,
  tab,
  onTab,
  loading,
}: {
  active: ScriptRun[];
  history: ScriptRun[];
  historyCursor?: string;
  historyBusy: boolean;
  selectedId?: string;
  onSelect: (run: ScriptRun) => void;
  onMore: (cursor: string) => void;
  onRerun: (run: ScriptRun) => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
  loading: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = tab === 'active' && active.length > 0;
  useEffect(() => {
    if (!ticking) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [ticking]);

  const runs = tab === 'active' ? active : history;
  return (
    <section className="sr-panel sr-runs" aria-label="Script runs">
      <header className="sr-panel-header sr-runs-header">
        <div>
          <Activity size={17} />
          <h2>Runs</h2>
        </div>
        <div className="sr-segment" aria-label="Run view">
          <button aria-pressed={tab === 'active'} onClick={() => onTab('active')}>
            Active <span>{active.length}</span>
          </button>
          <button aria-pressed={tab === 'history'} onClick={() => onTab('history')}>
            <History size={14} /> History
          </button>
        </div>
      </header>
      {runs.length ? (
        <div className="sr-run-list">
          {runs.map((run) => (
            <div className="sr-run-row" data-selected={run.id === selectedId} key={run.id}>
              <button
                className="sr-run-select"
                onClick={() => onSelect(run)}
                aria-pressed={run.id === selectedId}
              >
                <span className="sr-run-name">
                  <FileCode2 size={17} />
                  <span>
                    <strong>{run.title}</strong>
                    <small title={run.cwd}>{run.cwd}</small>
                  </span>
                </span>
                <RunBadge run={run} />
                <span className="sr-row-time">
                  <Clock3 size={14} />
                  {elapsed(run, now)}
                </span>
                <span className="sr-row-date">
                  {tab === 'active'
                    ? run.requestedBy
                    : new Date(run.finishedAt ?? run.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                </span>
                <ArrowUpRight className="sr-row-arrow" size={15} />
              </button>
              {!isActiveRun(run.status) && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Run again"
                  aria-label={`Run ${run.title} again`}
                  onClick={() => onRerun(run)}
                >
                  <ListRestart size={17} />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="sr-runs-empty">
          <Clock3 size={19} />
          <span>
            {loading
              ? 'Loading runs…'
              : tab === 'active'
                ? 'No scripts running'
                : 'No completed runs yet'}
          </span>
        </div>
      )}
      {tab === 'history' && historyCursor && (
        <div className="sr-more">
          <Button
            variant="ghost"
            size="sm"
            loading={historyBusy}
            onClick={() => onMore(historyCursor)}
          >
            <ArrowDown size={14} /> Load older runs
          </Button>
        </div>
      )}
    </section>
  );
}

export default function ScriptRunnerPage() {
  const { toast } = useToast();
  const [overview, setOverview] = useState<RunnerOverview | null>(null);
  const [overviewError, setOverviewError] = useState('');
  const [draft, setDraft] = useState<ScriptDraft>(starter);
  const [editorKey, setEditorKey] = useState(0);
  const [scriptId, setScriptId] = useState<string>();
  const [baseline, setBaseline] = useState(starter);
  const [saved, setSaved] = useState<ScriptDraft | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('active');
  const [selection, setSelection] = useState<ScriptRun | null>(null);
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [settings, setSettings] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [more, setMore] = useState<{ history: ScriptRun[]; next?: string } | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [discard, setDiscard] = useState<{ next: () => void } | null>(null);
  const pendingLaunch = useRef<{ signature: string; id: string; scriptId?: string } | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await runnerRequest<RunnerOverview>('', { signal });
      if (!signal?.aborted) {
        setOverview(result);
        setMore((current) =>
          current ? { ...current, history: mergeHistory(result.history, current.history) } : current
        );
        setSelection((current) => current ?? result.active[0] ?? result.history[0] ?? null);
        setOverviewError('');
      }
    } catch (error) {
      if (!signal?.aborted) setOverviewError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    let interval: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh(abort.signal);
      if (!abort.signal.aborted) interval = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(interval);
    };
  }, [refresh]);

  const valid = !!draft.title.trim() && !!draft.source.trim();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? baseline);
  const hasOnlineWorker = !!overview?.online;
  const scripts = overview?.scripts ?? [];
  const filtered = scripts.filter((script) =>
    script.title.toLowerCase().includes(query.toLowerCase())
  );
  const active = overview?.active ?? [];
  const history = mergeHistory(overview?.history ?? [], more?.history ?? []);
  const selected = selection
    ? (active.find((run) => run.id === selection.id) ??
      history.find((run) => run.id === selection.id) ??
      selection)
    : (active[0] ?? null);

  const updateSource = useCallback((source: string) => {
    setDraft((old) => ({ ...old, source }));
  }, []);

  function replaceDraft(next: () => void) {
    if (dirty) setDiscard({ next });
    else next();
  }

  function newDraft() {
    replaceDraft(() => {
      setDraft(emptyDraft);
      setEditorKey((key) => key + 1);
      setBaseline(emptyDraft);
      setScriptId(undefined);
      setSaved(null);
      setActionError('');
      requestAnimationFrame(() => document.getElementById('sr-script-title')?.focus());
    });
  }

  async function openScript(id: string) {
    setWorking(true);
    setActionError('');
    try {
      const response = await runnerRequest<SavedScript>(`/scripts/${id}`);
      const { title, source, cwd, args, timeoutSeconds } = response;
      const loaded = { title, source, cwd, args, timeoutSeconds };
      setScriptId(response.id);
      setDraft(loaded);
      setEditorKey((key) => key + 1);
      setSaved(loaded);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function saveScript(next: ScriptDraft, id?: string) {
    const response = await runnerRequest<SavedScript>(id ? `/scripts/${id}` : '/scripts', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(next),
    });
    const committed = {
      title: response.title,
      source: response.source,
      cwd: response.cwd,
      args: response.args,
      timeoutSeconds: response.timeoutSeconds,
    };
    setDraft((current) => (current === draft ? committed : current));
    setSaved(committed);
    setScriptId(response.id);
    void refresh();
    return response.id;
  }

  async function saveCurrent() {
    setWorking(true);
    setActionError('');
    try {
      await saveScript(draft, scriptId);
      toast({ variant: 'success', title: 'Script saved' });
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function deleteCurrent() {
    if (!scriptId) return;
    setWorking(true);
    setActionError('');
    try {
      await runnerRequest(`/scripts/${scriptId}`, { method: 'DELETE' });
      setScriptId(undefined);
      setDraft(starter);
      setEditorKey((key) => key + 1);
      setBaseline(starter);
      setSaved(null);
      setDeleteOpen(false);
      void refresh();
      toast({ variant: 'success', title: 'Script deleted' });
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  function selectRun(run: ScriptRun) {
    setSelection(run);
    if (window.matchMedia('(max-width: 1299px)').matches) {
      requestAnimationFrame(() =>
        document.getElementById('script-run-console')?.scrollIntoView({
          block: 'nearest',
          behavior: 'auto',
        })
      );
    }
  }

  function disposeLaunch() {
    pendingLaunch.current = null;
    setLaunch(null);
  }

  async function start(next: ScriptDraft, shouldSave: boolean) {
    const signature = JSON.stringify({ next, shouldSave });
    let pending = pendingLaunch.current;
    if (!pending || pending.signature !== signature) {
      pending = { signature, id: requestId(), scriptId: launch?.scriptId };
      if (shouldSave) pending.scriptId = await saveScript(next, pending.scriptId);
      pendingLaunch.current = pending;
    }
    const run = await runnerRequest<ScriptRun>('/runs', {
      method: 'POST',
      body: JSON.stringify({ ...next, id: pending.id, scriptId: pending.scriptId }),
    });
    disposeLaunch();
    setTab('active');
    selectRun(run);
    setOverview((current) =>
      current && isActiveRun(run.status)
        ? {
            ...current,
            active: [...current.active.filter((item) => item.id !== run.id), run],
          }
        : current
    );
    void refresh();
    toast({
      variant: 'success',
      title: isActiveRun(run.status) ? 'Run queued' : 'Run available in history',
    });
  }

  async function rerun(run: ScriptRun) {
    setActionError('');
    try {
      const snapshot = await runnerRequest<ScriptRun & { source: string }>(`/runs/${run.id}`);
      setLaunch({
        replay: true,
        scriptId: scripts.some((script) => script.id === snapshot.scriptId)
          ? snapshot.scriptId
          : undefined,
        draft: {
          title: snapshot.title,
          source: snapshot.source,
          cwd: snapshot.cwd,
          args: snapshot.args,
          timeoutSeconds: snapshot.timeoutSeconds,
        },
      });
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function loadEarlier(cursor: string) {
    setHistoryBusy(true);
    try {
      const result = await runnerRequest<RunnerOverview>(`?before=${encodeURIComponent(cursor)}`);
      setMore((previous) => ({
        history: mergeHistory(previous?.history ?? overview?.history ?? [], result.history),
        next: result.nextHistoryCursor,
      }));
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setHistoryBusy(false);
    }
  }

  return (
    <div className="script-runner">
      <header className="sr-hero">
        <div className="sr-hero-main">
          <div className="sr-hero-icon">
            <SquareTerminal size={28} strokeWidth={1.65} />
          </div>
          <div>
            <h1>Script Runner</h1>
            <p>Write Bash scripts, run them in the background, and follow their output.</p>
          </div>
        </div>
        <div className="sr-hero-actions">
          <span className={`sr-worker ${hasOnlineWorker ? 'sr-worker-online' : ''}`}>
            <Circle size={8} fill="currentColor" />
            {!overview
              ? 'Checking worker'
              : !overview.supported
                ? 'Linux worker required'
                : hasOnlineWorker
                  ? 'Worker online'
                  : 'Worker offline'}
          </span>
          <Button variant="outline" onClick={() => setSettings(true)}>
            <Settings2 size={16} /> Settings
          </Button>
        </div>
      </header>
      {overviewError && (
        <p className="sr-notice" role="status">
          {overviewError}
        </p>
      )}
      {actionError && !deleteOpen && (
        <p className="sr-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="sr-workspace">
        <section className="sr-panel sr-library" aria-label="Script library">
          <header className="sr-panel-header">
            <div>
              <Braces size={18} />
              <h2>Library</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={newDraft}
              disabled={working}
              title="New script"
              aria-label="New script"
            >
              <Plus size={19} />
            </Button>
          </header>
          {scripts.length > 0 ? (
            <>
              <label className="sr-search">
                <Search size={15} />
                <input
                  aria-label="Find scripts"
                  placeholder="Find a script"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="sr-library-list">
                {filtered.length ? (
                  filtered.map((script) => (
                    <button
                      key={script.id}
                      className="sr-library-item"
                      aria-pressed={script.id === scriptId}
                      disabled={working}
                      onClick={() => {
                        if (script.id !== scriptId) replaceDraft(() => void openScript(script.id));
                      }}
                    >
                      <FileCode2 size={16} />
                      <span>
                        <strong>{script.title}</strong>
                        <small title={script.cwd}>{script.cwd}</small>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="sr-muted">No matching scripts.</p>
                )}
              </div>
            </>
          ) : (
            <p className="sr-library-empty">
              {overview ? 'Save a script to reuse it here.' : 'Loading your scripts…'}
            </p>
          )}
          <div className="sr-library-footer">
            <span>
              <FileCode2 size={14} /> {scripts.length} saved
            </span>
            <span>
              <Clock3 size={14} /> {overview?.logRetentionDays ?? DEFAULT_RETENTION_DAYS}-day logs
            </span>
          </div>
        </section>

        <section className="sr-panel sr-author" aria-label="Script editor">
          <header className="sr-panel-header">
            <div>
              <FileCode2 size={17} />
              <h2>Editor</h2>
            </div>
            <span className="sr-editor-state">
              <i data-saved={!!saved && !dirty} />
              {saved && !dirty ? 'Saved' : 'Draft'}
            </span>
          </header>
          <div className="sr-editor-title">
            <label className="sr-field">
              <span>Script name</span>
              <input
                id="sr-script-title"
                className="sr-input"
                value={draft.title}
                maxLength={80}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Name this script"
              />
            </label>
            {scriptId && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete script"
                title="Delete script"
                disabled={working}
                onClick={() => {
                  setActionError('');
                  setDeleteOpen(true);
                }}
              >
                <Trash2 size={17} />
              </Button>
            )}
          </div>
          <div className="sr-code-frame">
            <div className="sr-code-header">
              <span>
                <FileCode2 size={14} /> script.sh
              </span>
              <code>Bash</code>
            </div>
            <BashEditor key={editorKey} value={draft.source} onChange={updateSource} />
          </div>
          <div className="sr-author-actions">
            <span className="sr-default-dir" title={draft.cwd}>
              <FolderOpen size={15} />
              <span>{draft.cwd}</span>
            </span>
            <div>
              <Button
                variant="outline"
                onClick={() => void saveCurrent()}
                loading={working}
                disabled={!valid || (!dirty && !!scriptId)}
              >
                <Save size={15} /> Save
              </Button>
              <Button
                className="sr-run-button"
                disabled={!valid || working}
                onClick={() => setLaunch({ draft, scriptId })}
              >
                <Play size={15} fill="currentColor" /> Run
              </Button>
            </div>
          </div>
        </section>

        <RunConsole run={selected} onRerun={(run) => void rerun(run)} />
      </div>

      <RunList
        active={active}
        history={history}
        historyCursor={more ? more.next : overview?.nextHistoryCursor}
        historyBusy={historyBusy}
        selectedId={selected?.id}
        onSelect={selectRun}
        onMore={(cursor) => void loadEarlier(cursor)}
        onRerun={(run) => void rerun(run)}
        tab={tab}
        onTab={setTab}
        loading={!overview}
      />

      {launch && (
        <BashLaunchDialog
          draft={launch.draft}
          recent={overview?.recentDirectories ?? []}
          online={hasOnlineWorker}
          canSave={!launch.replay}
          onClose={disposeLaunch}
          onLaunch={start}
        />
      )}
      {settings && (
        <RetentionDialog
          days={overview?.logRetentionDays ?? DEFAULT_RETENTION_DAYS}
          onClose={() => setSettings(false)}
          onSave={(days) => {
            setSettings(false);
            setOverview((current) => (current ? { ...current, logRetentionDays: days } : current));
            void refresh();
            toast({ variant: 'success', title: 'Log retention updated' });
          }}
        />
      )}
      {deleteOpen && (
        <RunnerDialog
          title="Delete saved script?"
          onClose={() => setDeleteOpen(false)}
          busy={working}
        >
          <div className="sr-dialog-form">
            <p className="sr-muted">
              <strong>{saved?.title}</strong> will be removed from the library. Existing runs stay
              in history.
            </p>
            {actionError && (
              <p className="sr-error" role="alert">
                {actionError}
              </p>
            )}
            <footer className="sr-dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={working}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                loading={working}
                onClick={() => void deleteCurrent()}
              >
                Delete script
              </Button>
            </footer>
          </div>
        </RunnerDialog>
      )}
      {discard && (
        <RunnerDialog title="Discard unsaved edits?" onClose={() => setDiscard(null)}>
          <div className="sr-dialog-form">
            <p className="sr-muted">Save this script to keep your changes in the library.</p>
            <footer className="sr-dialog-actions">
              <Button variant="outline" onClick={() => setDiscard(null)}>
                Keep editing
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDiscard(null);
                  discard.next();
                }}
              >
                Discard edits
              </Button>
            </footer>
          </div>
        </RunnerDialog>
      )}
    </div>
  );
}
