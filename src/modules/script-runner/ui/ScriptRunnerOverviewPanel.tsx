'use client';

import { useEffect, useId, useState } from 'react';
import { Activity, ArrowUpRight, FileCode2, Folder, History, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCRIPT_RUNTIMES, type ScriptRun } from '../types';
import { elapsed, RunBadge } from './RunConsole';
import './script-runner-management.css';

interface ScriptRunnerOverviewPanelProps {
  active: ScriptRun[];
  history: ScriptRun[];
  onNew: () => void;
  onLibrary: () => void;
  onRuns: () => void;
  onSelectRun: (run: ScriptRun) => void;
}

const snapshotSize = 4;

function RunSnapshot({
  active,
  runs,
  onSelect,
}: {
  active: boolean;
  runs: ScriptRun[];
  onSelect: (run: ScriptRun) => void;
}) {
  const headingId = useId();
  const [now, setNow] = useState(() => Date.now());
  const ticking = active && runs.length > 0;

  useEffect(() => {
    if (!ticking) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [ticking]);

  return (
    <section className="sr-panel" aria-labelledby={headingId}>
      <header className="sr-panel-header sr-management-header">
        <div>
          {active ? (
            <Activity size={17} aria-hidden="true" />
          ) : (
            <History size={17} aria-hidden="true" />
          )}
          <h2 id={headingId}>{active ? 'Active runs' : 'Recent runs'}</h2>
          {active && runs.length > 0 && <span className="sr-overview-count">{runs.length}</span>}
        </div>
      </header>
      {runs.length ? (
        <ul className="sr-overview-run-list" role="list">
          {runs.slice(0, snapshotSize).map((run) => {
            const date = run.finishedAt ?? run.createdAt;
            return (
              <li key={run.id}>
                <button type="button" className="sr-overview-run" onClick={() => onSelect(run)}>
                  <span className="sr-management-name">
                    <span className="sr-management-icon">
                      <FileCode2 size={16} aria-hidden="true" />
                    </span>
                    <span>
                      <strong title={run.title}>
                        <span className="sr-only">View run </span>
                        {run.title}
                      </strong>
                      <small>
                        {SCRIPT_RUNTIMES[run.language ?? 'bash'].label} ·{' '}
                        {active ? (
                          elapsed(run, now)
                        ) : (
                          <time dateTime={date}>
                            {new Date(date).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </time>
                        )}
                      </small>
                    </span>
                  </span>
                  <RunBadge run={run} />
                  <ArrowUpRight className="sr-management-arrow" size={15} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="sr-management-empty">
          {active ? 'No runs in progress.' : 'No completed runs yet.'}
        </p>
      )}
    </section>
  );
}

export default function ScriptRunnerOverviewPanel({
  active,
  history,
  onNew,
  onLibrary,
  onRuns,
  onSelectRun,
}: ScriptRunnerOverviewPanelProps) {
  return (
    <div className="sr-overview">
      <div className="sr-overview-actions" aria-label="Script Runner shortcuts" role="group">
        <Button
          type="button"
          variant="outline"
          className="sr-overview-action sr-overview-create"
          onClick={onNew}
        >
          <span className="sr-management-icon">
            <Plus size={20} aria-hidden="true" />
          </span>
          <span>New script</span>
          <ArrowUpRight className="sr-management-arrow" size={16} aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" className="sr-overview-action" onClick={onLibrary}>
          <span className="sr-management-icon">
            <Folder size={19} aria-hidden="true" />
          </span>
          <span>Browse saved scripts</span>
          <ArrowUpRight className="sr-management-arrow" size={16} aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" className="sr-overview-action" onClick={onRuns}>
          <span className="sr-management-icon">
            <Activity size={19} aria-hidden="true" />
          </span>
          <span>View runs</span>
          <ArrowUpRight className="sr-management-arrow" size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className="sr-overview-runs">
        <RunSnapshot active runs={active} onSelect={onSelectRun} />
        <RunSnapshot active={false} runs={history} onSelect={onSelectRun} />
      </div>
    </div>
  );
}
