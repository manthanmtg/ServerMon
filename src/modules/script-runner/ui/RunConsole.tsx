'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Circle,
  Clock3,
  FolderOpen,
  ListRestart,
  Radio,
  Square,
  Terminal,
  WrapText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SCRIPT_RUNTIMES,
  isActiveRun,
  type OutputBatch,
  type OutputEntry,
  type ScriptRun,
} from '../types';
import {
  errorMessage,
  runnerApi,
  runnerRequest,
  statusLabels,
  workingDirectoryLabel,
} from './client';

const VIEW_CHARS = 400_000;

export function elapsed(run: ScriptRun, now: number) {
  const start = Date.parse(run.startedAt ?? run.createdAt);
  const seconds = Math.max(
    0,
    Math.floor(((run.finishedAt ? Date.parse(run.finishedAt) : now) - start) / 1000)
  );
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  const s = seconds % 60;
  return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
}

export function RunBadge({ run }: { run: ScriptRun }) {
  return (
    <span className={`sr-status sr-status-${run.status}`}>
      <Circle size={7} fill="currentColor" />
      {run.status === 'running' && run.stopRequestedAt ? 'Stopping' : statusLabels[run.status]}
    </span>
  );
}

function OutputConsole({
  initial,
  onRerun,
  onFinished,
}: {
  initial: ScriptRun;
  onRerun: (run: ScriptRun) => void;
  onFinished?: (run: ScriptRun) => void;
}) {
  const [latest, setLatest] = useState<ScriptRun | null>(null);
  const [entries, setEntries] = useState<OutputEntry[]>([]);
  const [filter, setFilter] = useState<'all' | OutputEntry['stream']>('all');
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [connection, setConnection] = useState<'connecting' | 'open' | 'retrying' | 'done'>(
    'connecting'
  );
  const [stopBusy, setStopBusy] = useState(false);
  const [error, setError] = useState('');
  const [clipped, setClipped] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const output = useRef<HTMLDivElement>(null);
  const id = initial.id;
  const run = initial.logsPurgedAt ? initial : (latest ?? initial);
  const active = isActiveRun(run.status);

  useEffect(() => {
    let bytes = 0;
    let cursor = 0;
    const stream = new EventSource(`${runnerApi}/runs/${id}/output`);
    stream.onopen = () => setConnection('open');
    stream.onerror = () => setConnection('retrying');
    const receive = (batch: OutputBatch) => {
      setLatest(batch.run);
      if (batch.run.logsPurgedAt) {
        setEntries([]);
      } else if (batch.cursor > cursor) {
        cursor = batch.cursor;
        const additions = batch.entries;
        bytes += additions.reduce((size, entry) => size + entry.text.length, 0);
        if (bytes > VIEW_CHARS) setClipped(true);
        setEntries((current) => {
          const merged = [...current, ...additions];
          let size = 0;
          let index = merged.length;
          while (index > 0 && size < VIEW_CHARS) size += merged[--index].text.length;
          return index > 0 ? merged.slice(index) : merged;
        });
      }
    };
    stream.addEventListener('output', (event: MessageEvent<string>) =>
      receive(JSON.parse(event.data) as OutputBatch)
    );
    stream.addEventListener('done', (event: MessageEvent<string>) => {
      const batch = JSON.parse(event.data) as OutputBatch;
      receive(batch);
      onFinished?.(batch.run);
      stream.close();
      setConnection('done');
    });
    return () => stream.close();
  }, [id, onFinished]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  useEffect(() => {
    if (follow && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [entries, filter, follow, wrap]);

  async function stop() {
    setStopBusy(true);
    setError('');
    try {
      setLatest(await runnerRequest<ScriptRun>(`/runs/${id}/stop`, { method: 'POST' }));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setStopBusy(false);
    }
  }

  const visible = useMemo(() => {
    if (run.logsPurgedAt) return [];
    if (filter === 'all') return entries;
    return entries.filter((entry) => entry.stream === filter);
  }, [entries, filter, run.logsPurgedAt]);
  const directory = workingDirectoryLabel(run);
  return (
    <>
      <div className="sr-console-run">
        <div>
          <h3>
            {run.title}{' '}
            <span className="sr-console-runtime">
              {SCRIPT_RUNTIMES[run.language ?? 'bash'].label}
            </span>
          </h3>
          <p title={directory}>
            <FolderOpen size={13} /> <span>{directory}</span>
          </p>
          {run.pythonEnvironment && (
            <p title={`Revision ${run.pythonEnvironment.revisionId}`}>
              {run.pythonEnvironment.name} · Python {run.pythonEnvironment.pythonVersion} · Revision{' '}
              {run.pythonEnvironment.revisionId.slice(0, 8)}
            </p>
          )}
        </div>
        <RunBadge run={run} />
      </div>
      <div className="sr-console-toolbar">
        <div className="sr-segment" aria-label="Output filter">
          {(['all', 'stdout', 'stderr'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item === 'all' ? 'All' : item}
            </button>
          ))}
        </div>
        <div className="sr-tools">
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={wrap}
            aria-label="Wrap output"
            title="Wrap output"
            onClick={() => setWrap(!wrap)}
          >
            <WrapText size={15} />
          </Button>
          {!run.logsPurgedAt && (
            <a
              className="sr-icon-link"
              href={`${runnerApi}/runs/${id}/output?download=1`}
              aria-label="Download output"
              title="Download output"
            >
              <ArrowDownToLine size={15} />
            </a>
          )}
        </div>
      </div>
      <div
        className="sr-output"
        tabIndex={0}
        role="region"
        aria-label="Script output"
        ref={output}
        onScroll={(event) => {
          const view = event.currentTarget;
          if (view.scrollHeight - view.scrollTop - view.clientHeight > 40) setFollow(false);
        }}
      >
        {visible.length > 0 ? (
          <pre className={wrap ? 'sr-wrap' : ''}>
            {visible.map((entry, index) => (
              <span key={index} className={entry.stream === 'stderr' ? 'sr-stderr' : undefined}>
                {entry.text}
              </span>
            ))}
          </pre>
        ) : (
          <p className="sr-output-placeholder">
            {run.logsPurgedAt
              ? 'Logs expired'
              : connection === 'connecting'
                ? 'Connecting to output…'
                : active
                  ? 'Waiting for output…'
                  : filter !== 'all'
                    ? `No ${filter} captured.`
                    : 'This run produced no output.'}
          </p>
        )}
      </div>
      {(clipped || run.outputTruncated || run.message || connection === 'retrying' || error) && (
        <div className="sr-console-notes">
          {clipped && !run.logsPurgedAt && (
            <p>Showing the latest output. Download the log to see earlier entries.</p>
          )}
          {run.outputTruncated && !run.logsPurgedAt && (
            <p>Output capture reached its storage limit.</p>
          )}
          {run.message && <p>{run.message}</p>}
          {connection === 'retrying' && <p role="status">Reconnecting to output…</p>}
          {error && (
            <p role="alert" className="sr-error">
              {error}
            </p>
          )}
        </div>
      )}
      <footer className="sr-console-footer">
        <span>
          <Clock3 size={14} /> {elapsed(run, now)}{' '}
          {run.exitCode != null && <span>· Exit {run.exitCode}</span>}
          {run.signal != null && <span>· Signal {run.signal}</span>}
        </span>
        <div>
          {active ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Follow output"
                title="Follow output"
                aria-pressed={follow}
                onClick={() => setFollow(!follow)}
              >
                <Radio size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="sr-stop"
                onClick={() => void stop()}
                loading={stopBusy}
                disabled={!!run.stopRequestedAt}
              >
                <Square size={12} fill="currentColor" /> Stop
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => onRerun(run)}>
              <ListRestart size={15} /> Run again
            </Button>
          )}
        </div>
      </footer>
    </>
  );
}

export default function RunConsole({
  run,
  onRerun,
  onFinished,
}: {
  run: ScriptRun | null;
  onRerun: (run: ScriptRun) => void;
  onFinished?: (run: ScriptRun) => void;
}) {
  return (
    <section className="sr-panel sr-console" aria-label="Run console" id="script-run-console">
      <header className="sr-panel-header">
        <div>
          <Terminal size={17} />
          <h2>Run console</h2>
        </div>
        {run && isActiveRun(run.status) && (
          <span className="sr-live">
            <i /> Live
          </span>
        )}
      </header>
      {run ? (
        <OutputConsole key={run.id} initial={run} onRerun={onRerun} onFinished={onFinished} />
      ) : (
        <div className="sr-console-empty">
          <div className="sr-console-glyph">
            <Terminal size={30} strokeWidth={1.5} />
          </div>
          <strong>Ready for output</strong>
          <p>Select a run to see its stdout and stderr here.</p>
        </div>
      )}
    </section>
  );
}
