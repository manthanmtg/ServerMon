'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Activity, Boxes, ChevronLeft, Package, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/utils';
import RunnerDialog from '@/modules/script-runner/ui/RunnerDialog';
import type {
  PythonEnvironmentDetail,
  PythonEnvironmentOverview,
  PythonInterpreter,
  PythonRevision,
} from '../types';
import PythonInterpretersPanel from './PythonInterpretersPanel';
import '@/modules/script-runner/ui/script-runner.css';

const api = '/api/modules/python-environments';
const stages = {
  queued: 'Queued',
  creating: 'Creating',
  installing: 'Installing packages',
  checking: 'Checking dependencies',
  ready: 'Ready',
  failed: 'Build failed',
  removing: 'Cleaning up',
  pruned: 'Pruned',
};

async function request<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await fetch(api + path, {
    ...init,
    cache: 'no-store',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? 'Python Environments is unavailable.');
  return data;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The operation could not be completed.';
}

function building(revision?: PythonRevision) {
  return !!revision && ['queued', 'creating', 'installing', 'checking'].includes(revision.stage);
}

function label(environment: {
  deleting?: boolean;
  deleteError?: string;
  active?: PythonRevision;
  latest?: PythonRevision;
}) {
  if (environment.deleteError) return 'Deletion failed';
  if (environment.deleting) return 'Deleting';
  const { active, latest } = environment;
  if (active && latest && active.id !== latest.id) {
    if (latest.stage === 'ready' || latest.stage === 'pruned') return 'Ready';
    return `Ready · ${stages[latest.stage]}`;
  }
  return latest ? stages[latest.stage] : 'Unavailable';
}

function date(value?: string) {
  return value ? new Date(value).toLocaleString() : '—';
}

function CreateEnvironment({
  interpreters,
  onClose,
  onCreated,
}: {
  interpreters: PythonInterpreter[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [interpreterId, setInterpreterId] = useState(interpreters[0]?.id ?? '');
  const [requirements, setRequirements] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim() || !interpreterId) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ id: string }>('', {
        method: 'POST',
        body: JSON.stringify({ name, interpreterId, requirements }),
      });
      onCreated(result.id);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RunnerDialog title="New Python environment" onClose={onClose} busy={busy}>
      <form className="sr-dialog-form" onSubmit={create}>
        <label className="sr-field">
          <span>Name</span>
          <input
            className="sr-input"
            required
            maxLength={80}
            disabled={busy}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Weather Telegram Bot"
          />
        </label>
        <label className="sr-field">
          <span>Python interpreter</span>
          <select
            className="sr-input"
            required
            disabled={busy}
            value={interpreterId}
            onChange={(event) => setInterpreterId(event.target.value)}
          >
            {interpreters.map((item) => (
              <option key={item.id} value={item.id}>
                Python {item.version} ({item.id})
              </option>
            ))}
          </select>
        </label>
        <label className="sr-field">
          <span>Requirements (optional)</span>
          <textarea
            className="sr-input sr-mono py-2!"
            rows={5}
            maxLength={32768}
            value={requirements}
            disabled={busy}
            placeholder="httpx==0.28.1"
            onChange={(event) => setRequirements(event.target.value)}
          />
        </label>
        <p className="sr-muted">One named package per line. Version constraints are supported.</p>
        {error && (
          <p className="sr-error" role="alert">
            {error}
          </p>
        )}
        <footer className="sr-dialog-actions">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!name.trim() || !interpreterId}>
            Create environment
          </Button>
        </footer>
      </form>
    </RunnerDialog>
  );
}

function EnvironmentDetails({
  environment,
  online,
  onChanged,
  onBack,
}: {
  environment: PythonEnvironmentDetail;
  online: boolean;
  onChanged: () => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<'Overview' | 'Dependencies' | 'Activity'>('Overview');
  const [draft, setDraft] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = environment.revisions.find(({ id }) => id === environment.active?.id);
  const inProgress = building(environment.latest) || !!environment.deleting;
  const requirements = draft ?? environment.requirements;

  async function action(path: string, method: string, success: string, body?: object) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/${environment.id}${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (method === 'PATCH') setDraft(undefined);
      setDeleting(false);
      setNotice(success);
      onChanged();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sr-panel" aria-label="Environment detail">
      <header className="sr-panel-header flex-wrap">
        <div className="min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Back to environments"
            onClick={onBack}
          >
            <ChevronLeft size={18} />
          </Button>
          <h2 className="break-words">{environment.name}</h2>
        </div>
        <span className="sr-muted">{label(environment)}</span>
      </header>
      <div className="grid gap-4 p-3 sm:p-4">
        <nav aria-label="Environment views" className="sr-segment flex-wrap">
          {(['Overview', 'Dependencies', 'Activity'] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={tab === view}
              onClick={() => setTab(view)}
            >
              {view}
            </button>
          ))}
        </nav>
        {notice && (
          <p className="sr-notice" role="status">
            {notice}
          </p>
        )}
        {error && !deleting && (
          <p className="sr-error" role="alert">
            {error}
          </p>
        )}
        {environment.deleteError && (
          <p className="sr-error" role="alert">
            {environment.deleteError}
          </p>
        )}
        {tab === 'Overview' && (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Python', active?.pythonVersion ?? environment.interpreterId],
                ['Active revision', active?.id.slice(0, 8) ?? '—'],
                [
                  'Last successful build',
                  date(
                    environment.revisions.find(({ pythonVersion }) => !!pythonVersion)?.finishedAt
                  ),
                ],
                ['Stored revisions', formatBytes(environment.diskBytes)],
              ].map(([heading, value]) => (
                <div key={heading} className="rounded-md border border-[var(--sr-edge)] p-3">
                  <dt className="sr-muted">{heading}</dt>
                  <dd className="mt-1 font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold">Linked scripts</h3>
              {environment.consumers.length ? (
                <ul className="divide-y divide-[var(--sr-edge)] rounded-md border border-[var(--sr-edge)]">
                  {environment.consumers.map((consumer) => (
                    <li
                      key={consumer.id}
                      className="flex flex-wrap justify-between gap-2 p-3 text-sm"
                    >
                      <span className="break-words">{consumer.title}</span>
                      {consumer.scheduled && <span className="sr-muted">Schedule enabled</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sr-muted">No saved scripts use this environment.</p>
              )}
              <Link
                href="/scripts"
                className="w-fit text-sm text-primary underline underline-offset-4"
              >
                Open Script Runner
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  !online ||
                  busy ||
                  building(environment.latest) ||
                  (!!environment.deleting && !environment.deleteError) ||
                  environment.scriptsCount > 0
                }
                onClick={() => {
                  setError('');
                  setDeleting(true);
                }}
              >
                <Trash2 size={15} />{' '}
                {environment.deleteError ? 'Retry deletion' : 'Delete environment'}
              </Button>
              {environment.scriptsCount > 0 && (
                <p className="sr-muted">
                  Unlink the saved scripts before deleting this environment.
                </p>
              )}
            </div>
          </>
        )}
        {tab === 'Dependencies' && (
          <>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!busy && !inProgress && online)
                  void action('', 'PATCH', 'Build queued.', { requirements });
              }}
            >
              <label className="sr-field">
                <span>Requirements</span>
                <textarea
                  className="sr-input sr-mono py-2!"
                  rows={7}
                  maxLength={32768}
                  value={requirements}
                  disabled={busy || inProgress}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
              <p className="sr-muted">
                Build an update to apply these dependencies. Successful builds become active for new
                runs.
              </p>
              <Button
                type="submit"
                className="w-fit"
                loading={busy}
                disabled={!online || inProgress}
              >
                Build update
              </Button>
            </form>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Package size={16} /> Installed packages
            </h3>
            {active?.packages?.length ? (
              <ul className="grid gap-1 rounded-md border border-[var(--sr-edge)] p-3 sm:grid-cols-2 lg:grid-cols-3">
                {active.packages.map((pkg, index) => (
                  <li
                    key={`${pkg.name}-${index}`}
                    className="flex min-w-0 flex-wrap justify-between gap-x-3 border-b border-[var(--sr-edge)] p-2 text-sm"
                  >
                    <code className="wrap-anywhere">{pkg.name}</code>
                    <span className="sr-muted">{pkg.version}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sr-muted">Package details appear after the first successful build.</p>
            )}
          </>
        )}
        {tab === 'Activity' && (
          <ul className="divide-y divide-[var(--sr-edge)] rounded-md border border-[var(--sr-edge)]">
            {environment.revisions.map((revision) => (
              <li key={revision.id} className="grid gap-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm">
                      Revision <code>{revision.id.slice(0, 8)}</code>
                    </strong>
                    <p className="sr-muted">
                      {stages[revision.stage]}
                      {revision.id === active?.id && ' · Active'} · {date(revision.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {revision.diskBytes ? (
                      <span className="sr-muted">{formatBytes(revision.diskBytes)}</span>
                    ) : null}
                    {revision.stage === 'ready' && revision.id !== active?.id && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || inProgress}
                        onClick={() =>
                          void action('/restore', 'POST', 'Revision restored.', {
                            revisionId: revision.id,
                          })
                        }
                      >
                        Restore revision {revision.id.slice(0, 8)}
                      </Button>
                    )}
                  </div>
                </div>
                {revision.error && <p className="sr-error">{revision.error}</p>}
                {revision.log && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">Build log</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-[var(--sr-inset)] p-3 text-xs whitespace-pre-wrap wrap-anywhere">
                      {revision.log}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {deleting && (
        <RunnerDialog
          title="Delete Python environment?"
          busy={busy}
          onClose={() => setDeleting(false)}
        >
          <div className="sr-dialog-form">
            <p className="sr-muted">Delete {environment.name} and its stored revisions.</p>
            {error && (
              <p className="sr-error" role="alert">
                {error}
              </p>
            )}
            <footer className="sr-dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleting(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                loading={busy}
                onClick={() => void action('', 'DELETE', 'Deletion queued.')}
              >
                Delete environment
              </Button>
            </footer>
          </div>
        </RunnerDialog>
      )}
    </section>
  );
}

export default function PythonEnvironmentsPage() {
  const [overview, setOverview] = useState<PythonEnvironmentOverview>();
  const [detail, setDetail] = useState<PythonEnvironmentDetail>();
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      try {
        const result = await request<PythonEnvironmentOverview>('', { signal: controller.signal });
        if (controller.signal.aborted) return;
        setOverview(result);
        if (selectedId && result.environments.some(({ id }) => id === selectedId)) {
          const selected = await request<PythonEnvironmentDetail>(`/${selectedId}`, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setDetail(selected);
        } else if (selectedId) {
          setSelectedId(undefined);
          setDetail(undefined);
        }
        setError('');
      } catch (error) {
        if (!controller.signal.aborted) setError(message(error));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void update(), 3000);
      }
    };
    void update();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedId, refresh]);

  const results = overview?.environments.filter(({ name }) =>
    name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const reload = () => setRefresh((value) => value + 1);

  return (
    <div className="script-runner grid gap-4">
      <header className="sr-hero flex-wrap">
        <div className="sr-hero-main">
          <div className="sr-hero-icon">
            <Boxes size={26} />
          </div>
          <div>
            <h1>Python Environments</h1>
            <p>Build reusable Python dependencies for saved and scheduled scripts.</p>
          </div>
        </div>
        <Button
          type="button"
          disabled={!overview?.online || !overview.interpreters.length}
          onClick={() => setCreating(true)}
        >
          <Plus size={17} /> New environment
        </Button>
      </header>
      {error && (
        <p className="sr-error" role="alert">
          {error}
        </p>
      )}
      {overview && (!overview.online || !overview.interpreters.length) && (
        <p className="sr-notice" role="status">
          {!overview.supported
            ? 'Managed environments require the Linux Script Runner worker.'
            : (overview.workerError ??
              (overview.online
                ? 'Install a Python version to create an environment.'
                : 'The Python build worker is offline.'))}
        </p>
      )}
      {overview?.supported && !selectedId && (
        <PythonInterpretersPanel
          interpreters={overview.interpreters}
          installs={overview.interpreterInstalls}
          online={overview.online}
          onInstall={async (version) => {
            await request('/interpreters', { method: 'POST', body: JSON.stringify({ version }) });
            reload();
          }}
        />
      )}
      {selectedId ? (
        detail?.id === selectedId ? (
          <EnvironmentDetails
            key={selectedId}
            environment={detail}
            online={!!overview?.online}
            onChanged={reload}
            onBack={() => setSelectedId(undefined)}
          />
        ) : (
          <p className="sr-muted" role="status">
            Loading environment…
          </p>
        )
      ) : (
        <section className="sr-panel" aria-label="Environment inventory">
          <header className="sr-panel-header">
            <div>
              <Activity size={17} />
              <h2>Environments</h2>
            </div>
          </header>
          <div className="grid gap-3 p-3 sm:p-4">
            <label className="sr-search m-0! w-full sm:max-w-xs">
              <Search size={16} />
              <span className="sr-only">Search environments</span>
              <input
                type="search"
                placeholder="Search environments…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {!overview ? (
              <p className="sr-muted" role="status">
                Loading environments…
              </p>
            ) : results?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--sr-edge)] text-muted-foreground">
                    <tr>
                      {['Environment', 'Python', 'Status', 'Packages', 'Disk usage', 'Used by'].map(
                        (heading) => (
                          <th
                            key={heading}
                            scope="col"
                            className="px-3 py-2 font-medium whitespace-nowrap"
                          >
                            {heading}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sr-edge)]">
                    {results.map((environment) => (
                      <tr key={environment.id} className="hover:bg-accent/35">
                        <th scope="row" className="px-2 py-1 text-left font-medium">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setSelectedId(environment.id)}
                          >
                            {environment.name}
                          </Button>
                        </th>
                        <td className="px-3 py-2">
                          {environment.active?.pythonVersion ?? environment.interpreterId}
                        </td>
                        <td className="px-3 py-2">{label(environment)}</td>
                        <td className="px-3 py-2">{environment.active?.packageCount ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatBytes(environment.diskBytes)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {environment.scriptsCount}{' '}
                          {environment.scriptsCount === 1 ? 'script' : 'scripts'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sr-muted">
                {search.trim()
                  ? 'No environments match your search.'
                  : 'No Python environments yet.'}
              </p>
            )}
          </div>
        </section>
      )}
      {creating && overview && (
        <CreateEnvironment
          interpreters={overview.interpreters}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setSelectedId(id);
            reload();
          }}
        />
      )}
    </div>
  );
}
