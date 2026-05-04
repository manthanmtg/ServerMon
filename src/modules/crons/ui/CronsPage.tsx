'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  FolderOpen,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { cn } from '@/lib/utils';
import type { CronJob, CronRunStatus, CronsSnapshot } from '../types';
import { CronSummaryCards } from './components/CronSummaryCards';
import { NextScheduledRunCard } from './components/NextScheduledRunCard';
import { CronFormModal } from './components/CronFormModal';
import { NextRunsPanel } from './components/NextRunsPanel';
import { PastRunsPanel } from './components/PastRunsPanel';
import { formatCountdown, formatPastTime, useRealtimeNow } from './time';

type FilterSource = 'all' | 'user' | 'system';
type FilterStatus = 'all' | 'active' | 'disabled';
type SortField = 'command' | 'expression' | 'user' | 'source' | 'nextRun';
type SortDir = 'asc' | 'desc';
type ViewTab = 'jobs' | 'system' | 'manual' | 'logs';

const viewTabLabels: Record<ViewTab, string> = {
  jobs: 'jobs',
  system: 'system',
  manual: 'manual run history',
  logs: 'system logs',
};

// ---- Main Page ----

export default function CronsPage() {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<CronsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const now = useRealtimeNow();
  const [refreshMs, setRefreshMs] = useState(30000);
  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('command');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>('jobs');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; job?: CronJob } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<CronRunStatus | null>(null);
  const [runPolling, setRunPolling] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const stdoutRef = useRef<HTMLPreElement | null>(null);

  // Confirmation states
  const [confirmRun, setConfirmRun] = useState<CronJob | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<CronJob | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CronJob | null>(null);

  const showRunOutput = useCallback(async (run: CronRunStatus) => {
    setActiveRun(run);
    if (run.status === 'running') {
      setRunPolling(true);
    } else if (!run.stdout) {
      // Fetch full details for completed runs that don't have stdout (from history list)
      try {
        const res = await fetch(`/api/modules/crons/${run.jobId}/run?runId=${run.runId}`);
        if (res.ok) {
          const fullRun = await res.json();
          setActiveRun(fullRun);
        }
      } catch (error) {
        console.error('Failed to fetch full run details', error);
      }
    }
  }, []);

  const loadSnapshot = useCallback(async () => {
    const response = await fetch('/api/modules/crons', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch crons data');
    }
    setSnapshot(data);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSnapshot()
      .catch((error: unknown) => {
        if (active) {
          toast({
            title: 'Crons snapshot failed',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const interval = window.setInterval(() => {
      loadSnapshot().catch(() => {});
    }, refreshMs);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadSnapshot, refreshMs, toast]);

  const filteredJobs = useMemo(() => {
    if (!snapshot) return [];
    let list = snapshot.jobs;

    if (filterSource !== 'all') {
      list = list.filter((j) =>
        filterSource === 'user' ? j.source === 'user' : j.source !== 'user'
      );
    }

    if (filterStatus !== 'all') {
      list = list.filter((j) => (filterStatus === 'active' ? j.enabled : !j.enabled));
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (j) =>
          j.command.toLowerCase().includes(q) ||
          j.expression.toLowerCase().includes(q) ||
          j.user.toLowerCase().includes(q) ||
          j.comment?.toLowerCase().includes(q) ||
          j.description?.toLowerCase().includes(q)
      );
    }

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'command':
          cmp = a.command.localeCompare(b.command);
          break;
        case 'expression':
          cmp = a.expression.localeCompare(b.expression);
          break;
        case 'user':
          cmp = a.user.localeCompare(b.user);
          break;
        case 'source':
          cmp = a.source.localeCompare(b.source);
          break;
        case 'nextRun': {
          const aNext = a.nextRuns[0] ? new Date(a.nextRuns[0]).getTime() : Infinity;
          const bNext = b.nextRuns[0] ? new Date(b.nextRuns[0]).getTime() : Infinity;
          cmp = aNext - bNext;
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [snapshot, filterSource, filterStatus, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'command' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  }

  async function toggleJob(job: CronJob) {
    setConfirmToggle(null);
    setPendingAction(`${job.id}:toggle`);
    try {
      const response = await fetch(`/api/modules/crons/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed');
      toast({
        title: job.enabled ? 'Job disabled' : 'Job enabled',
        description: data.message,
        variant: 'success',
      });
      await loadSnapshot();
    } catch (error: unknown) {
      toast({
        title: 'Toggle failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteJob(job: CronJob) {
    setConfirmDelete(null);
    setPendingAction(`${job.id}:delete`);
    try {
      const response = await fetch(`/api/modules/crons/${job.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed');
      toast({ title: 'Job deleted', description: data.message, variant: 'success' });
      await loadSnapshot();
    } catch (error: unknown) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function runJobNow(job: CronJob) {
    setConfirmRun(null);
    setPendingAction(`${job.id}:run`);
    try {
      const response = await fetch(`/api/modules/crons/${job.id}/run`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed');
      toast({ title: 'Run triggered', description: `PID ${data.run.pid}`, variant: 'success' });
      setActiveRun(data.run);
      setRunPolling(true);
    } catch (error: unknown) {
      toast({
        title: 'Run failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingAction(null);
    }
  }

  // Poll active run status
  useEffect(() => {
    if (!runPolling || !activeRun) return;
    if (activeRun.status !== 'running') {
      setRunPolling(false);
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/modules/crons/${activeRun.jobId}/run?runId=${activeRun.runId}`
        );
        if (res.ok) {
          const data: CronRunStatus = await res.json();
          setActiveRun(data);
          if (data.status !== 'running') {
            setRunPolling(false);
          }
        }
      } catch {
        /* ignore polling errors */
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [runPolling, activeRun]);

  // Auto-scroll stdout panel when new output arrives
  useEffect(() => {
    if (!autoScroll) return;
    if (!stdoutRef.current) return;
    stdoutRef.current.scrollTop = stdoutRef.current.scrollHeight;
  }, [autoScroll, activeRun?.stdout, activeRun?.status]);

  async function handleCreateSubmit(data: {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
    command: string;
    comment?: string;
  }) {
    const response = await fetch('/api/modules/crons/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed');
    toast({ title: 'Job created', description: result.message, variant: 'success' });
    setModal(null);
    await loadSnapshot();
  }

  async function handleEditSubmit(
    jobId: string,
    data: {
      minute: string;
      hour: string;
      dayOfMonth: string;
      month: string;
      dayOfWeek: string;
      command: string;
      comment?: string;
    }
  ) {
    const response = await fetch(`/api/modules/crons/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed');
    toast({ title: 'Job updated', description: result.message, variant: 'success' });
    setModal(null);
    await loadSnapshot();
  }

  function copyExpression(expr: string, id: string) {
    navigator.clipboard.writeText(expr).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="crons-page">
      {/* Hero header */}
      <section className="rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,var(--primary)/0.18,transparent_40%),linear-gradient(180deg,var(--card),color-mix(in_oklab,var(--card)_92%,transparent))] p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={snapshot?.crontabAvailable ? 'success' : 'warning'}>
                {snapshot?.crontabAvailable ? 'crontab connected' : 'Mock mode'}
              </Badge>
              <Badge variant="outline">Source: {snapshot?.source || 'unknown'}</Badge>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Cron Jobs Manager
              </h2>
              <p className="text-sm text-muted-foreground">
                Schedule, monitor, and manage cron jobs with visual schedule building and execution
                tracking.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Source
              <select
                className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value as FilterSource)}
              >
                <option value="all">All sources</option>
                <option value="user">User crons</option>
                <option value="system">System crons</option>
              </select>
            </label>
            <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Refresh
              <select
                className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                value={String(refreshMs)}
                onChange={(e) => setRefreshMs(Number(e.target.value))}
              >
                <option value="10000">10 sec</option>
                <option value="30000">30 sec</option>
                <option value="60000">1 min</option>
                <option value="300000">5 min</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => loadSnapshot().catch(() => undefined)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh now
            </button>
          </div>
        </div>
      </section>

      {/* Summary cards */}
      <CronSummaryCards summary={snapshot?.summary} />

      {/* Next run card */}
      {snapshot?.summary.nextRunTime && (
        <NextScheduledRunCard
          nextRunJob={snapshot.summary.nextRunJob}
          nextRunTime={snapshot.summary.nextRunTime}
          now={now}
        />
      )}

      {/* Tab navigation */}
      <div className="flex items-center gap-4 flex-wrap">
        <div
          role="tablist"
          aria-label="Cron views"
          className="inline-flex rounded-xl border border-border bg-muted/30 p-1"
        >
          {(['jobs', 'system', 'manual', 'logs'] as ViewTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              id={`cron-view-tab-${tab}`}
              role="tab"
              aria-selected={viewTab === tab}
              aria-controls={`cron-view-panel-${tab}`}
              onClick={() => setViewTab(tab)}
              className={cn(
                'min-h-[44px] rounded-lg px-4 text-xs font-semibold uppercase tracking-[0.18em] transition-colors flex items-center gap-2',
                viewTab === tab
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab === 'jobs' && <Clock className="w-3.5 h-3.5" />}
              {tab === 'system' && <FolderOpen className="w-3.5 h-3.5" />}
              {tab === 'manual' && <RefreshCcw className="w-3.5 h-3.5" />}
              {tab === 'logs' && <Terminal className="w-3.5 h-3.5" />}
              {viewTabLabels[tab]}
            </button>
          ))}
        </div>
        {viewTab === 'jobs' && (
          <>
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="h-10 px-3 rounded-xl border border-border bg-background text-sm outline-none"
            >
              <option value="all">All status</option>
              <option value="active">Active only</option>
              <option value="disabled">Disabled only</option>
            </select>
            <Button onClick={() => setModal({ mode: 'create' })} className="ml-auto">
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </Button>
          </>
        )}
      </div>

      {/* Jobs table */}
      {viewTab === 'jobs' && (
        <Card
          id="cron-view-panel-jobs"
          role="tabpanel"
          aria-labelledby="cron-view-tab-jobs"
          className="border-border/60 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground bg-muted/20">
                <tr>
                  <th className="py-3 px-4 w-8" />
                  <th className="py-3 px-4">Status</th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('expression')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Schedule <SortIcon field="expression" />
                    </span>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('command')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Command <SortIcon field="command" />
                    </span>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('user')}
                  >
                    <span className="inline-flex items-center gap-1">
                      User <SortIcon field="user" />
                    </span>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('source')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Source <SortIcon field="source" />
                    </span>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer select-none"
                    onClick={() => toggleSort('nextRun')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Next Run <SortIcon field="nextRun" />
                    </span>
                  </th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      No cron jobs match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job) => {
                    const isExpanded = expandedJob === job.id;
                    return (
                      <Fragment key={job.id}>
                        <tr
                          data-testid="cron-job-row"
                          className={cn(
                            'border-t border-border/60 transition-colors hover:bg-muted/10',
                            isExpanded && 'bg-muted/10'
                          )}
                        >
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? 'Hide' : 'Show'} next runs for ${job.command}`}
                              onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                              className="p-1 rounded hover:bg-accent transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={job.enabled ? 'success' : 'secondary'}>
                              {job.enabled ? 'active' : 'disabled'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                                {job.expression}
                              </code>
                              <button
                                type="button"
                                onClick={() => copyExpression(job.expression, job.id)}
                                className="p-0.5 rounded hover:bg-accent transition-colors"
                                title="Copy expression"
                              >
                                {copiedId === job.id ? (
                                  <Check className="w-3 h-3 text-success" />
                                ) : (
                                  <Copy className="w-3 h-3 text-muted-foreground" />
                                )}
                              </button>
                            </div>
                            {job.description && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {job.description}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className="font-mono text-xs max-w-[280px] truncate block"
                              title={job.command}
                            >
                              {job.command}
                            </span>
                            {job.comment && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[280px]">
                                {job.comment}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs">{job.user}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="text-[10px]">
                              {job.source}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {job.nextRuns[0] ? (
                              <span
                                className="text-foreground font-mono whitespace-nowrap cursor-help underline decoration-dashed decoration-border/50 underline-offset-4"
                                title={new Date(job.nextRuns[0]).toLocaleString(undefined, {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  timeZoneName: 'short',
                                })}
                              >
                                {formatCountdown(job.nextRuns[0], now)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              {job.source === 'user' && (
                                <>
                                  <button
                                    type="button"
                                    title={job.enabled ? 'Disable' : 'Enable'}
                                    disabled={pendingAction === `${job.id}:toggle`}
                                    onClick={() => setConfirmToggle(job)}
                                    className="p-1.5 rounded-lg hover:bg-accent transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                                  >
                                    {pendingAction === `${job.id}:toggle` ? (
                                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                                    ) : job.enabled ? (
                                      <Pause className="w-3.5 h-3.5 text-warning" />
                                    ) : (
                                      <Play className="w-3.5 h-3.5 text-success" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    title="Edit"
                                    onClick={() => setModal({ mode: 'edit', job })}
                                    className="p-1.5 rounded-lg hover:bg-accent transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Run Now"
                                    disabled={pendingAction === `${job.id}:run`}
                                    onClick={() => setConfirmRun(job)}
                                    className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                                  >
                                    {pendingAction === `${job.id}:run` ? (
                                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Zap className="w-3.5 h-3.5 text-primary" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    title="Delete"
                                    disabled={pendingAction === `${job.id}:delete`}
                                    onClick={() => setConfirmDelete(job)}
                                    className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                                  >
                                    {pendingAction === `${job.id}:delete` ? (
                                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                    )}
                                  </button>
                                </>
                              )}
                              {job.source !== 'user' && (
                                <span className="text-[10px] text-muted-foreground">read-only</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-t border-border/40">
                            <td colSpan={8} className="p-4 bg-muted/5">
                              <div className="grid gap-4 lg:grid-cols-2">
                                <div>
                                  <NextRunsPanel job={job} />
                                </div>
                                <div className="space-y-2">
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                    Details
                                  </p>
                                  <div className="text-xs space-y-1">
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground w-20 shrink-0">
                                        Full command:
                                      </span>
                                      <code className="font-mono text-foreground break-all">
                                        {job.command}
                                      </code>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground w-20 shrink-0">
                                        Expression:
                                      </span>
                                      <code className="font-mono text-foreground">
                                        {job.expression}
                                      </code>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground w-20 shrink-0">
                                        User:
                                      </span>
                                      <span className="text-foreground">{job.user}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground w-20 shrink-0">
                                        Source:
                                      </span>
                                      <span className="text-foreground">
                                        {job.source}
                                        {job.sourceFile ? ` (${job.sourceFile})` : ''}
                                      </span>
                                    </div>
                                    {job.comment && (
                                      <div className="flex gap-2">
                                        <span className="text-muted-foreground w-20 shrink-0">
                                          Comment:
                                        </span>
                                        <span className="text-foreground">{job.comment}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {job.source === 'user' && (
                                  <div className="pt-2">
                                    <PastRunsPanel jobId={job.id} onShowOutput={showRunOutput} />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* System cron directories tab */}
      {viewTab === 'system' && (
        <div
          id="cron-view-panel-system"
          role="tabpanel"
          aria-labelledby="cron-view-tab-system"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {(snapshot?.systemDirs || []).map((dir) => (
            <Card key={dir.name} className="border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-primary" />
                    {dir.name}
                  </CardTitle>
                  <Badge variant="outline">{dir.count} scripts</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{dir.path}</p>
              </CardHeader>
              <CardContent>
                {dir.scripts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No scripts in this directory.</p>
                ) : (
                  <div className="space-y-1">
                    {dir.scripts.map((script) => (
                      <div
                        key={script}
                        className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/30"
                      >
                        <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="font-mono text-foreground">{script}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {(snapshot?.systemDirs || []).length === 0 && (
            <Card className="border-border/60 sm:col-span-2 lg:col-span-3">
              <CardContent className="py-12 text-center text-muted-foreground">
                No system cron directories found.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Execution logs tab */}
      {viewTab === 'logs' && (
        <Card
          id="cron-view-panel-logs"
          role="tabpanel"
          aria-labelledby="cron-view-tab-logs"
          className="border-border/60"
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent System Cron Logs</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Parsed from system journal or syslog.
                </p>
              </div>
              <Badge variant="outline">{snapshot?.recentLogs.length || 0} entries</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {(snapshot?.recentLogs || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recent cron logs found.
              </p>
            ) : (
              <div className="max-h-[500px] overflow-y-auto space-y-1 font-mono text-xs">
                {(snapshot?.recentLogs || []).map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-muted/20"
                  >
                    <span className="text-muted-foreground shrink-0 w-[80px]">
                      {formatPastTime(entry.timestamp, now)}
                    </span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      PID {entry.pid}
                    </Badge>
                    <span className="text-foreground break-all">{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Global Manual Run History tab */}
      {viewTab === 'manual' && (
        <Card
          id="cron-view-panel-manual"
          role="tabpanel"
          aria-labelledby="cron-view-tab-manual"
          className="border-border/60"
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Manual Execution History</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Historical records of jobs triggered through this interface.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <PastRunsPanel jobId="" onShowOutput={showRunOutput} />
          </CardContent>
        </Card>
      )}

      {/* Run Output modal */}
      {activeRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => {
              if (activeRun.status !== 'running') setActiveRun(null);
            }}
          />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl mx-4">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Run Output</h2>
                <Badge
                  variant={
                    activeRun.status === 'running'
                      ? 'warning'
                      : activeRun.status === 'completed'
                        ? 'success'
                        : 'destructive'
                  }
                >
                  {activeRun.status === 'running' && (
                    <LoaderCircle className="w-3 h-3 mr-1 animate-spin" />
                  )}
                  {activeRun.status}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setActiveRun(null)}
                className="p-2 rounded-lg hover:bg-accent transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-xs space-y-1">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Command:</span>
                  <code className="font-mono text-foreground break-all">{activeRun.command}</code>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">PID:</span>
                  <span className="font-mono text-foreground">{activeRun.pid}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Started:</span>
                  <span className="text-foreground">
                    {new Date(activeRun.startedAt).toLocaleString()}
                  </span>
                </div>
                {activeRun.finishedAt && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-20 shrink-0">Finished:</span>
                    <span className="text-foreground">
                      {new Date(activeRun.finishedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {activeRun.exitCode !== null && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-20 shrink-0">Exit code:</span>
                    <span
                      className={cn(
                        'font-mono',
                        activeRun.exitCode === 0 ? 'text-success' : 'text-destructive'
                      )}
                    >
                      {activeRun.exitCode}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Run Output
                  </p>
                  <button
                    type="button"
                    onClick={() => setAutoScroll((prev) => !prev)}
                    className="text-[10px] font-medium text-muted-foreground border border-border rounded px-2 py-1 flex items-center gap-1 hover:bg-accent transition-colors"
                  >
                    <RefreshCcw className={cn('w-3 h-3', autoScroll && 'text-primary')} />
                    Autoscroll: {autoScroll ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="relative">
                  <pre
                    ref={stdoutRef}
                    className={cn(
                      'max-h-[400px] overflow-auto rounded-xl bg-muted/30 border border-border p-4 text-xs font-mono text-foreground whitespace-pre-wrap break-all',
                      !activeRun.stdout &&
                        activeRun.status !== 'running' &&
                        'flex items-center justify-center text-muted-foreground italic min-h-[100px]'
                    )}
                  >
                    {activeRun.stdout ||
                      (activeRun.status === 'running'
                        ? 'Waiting for output...'
                        : 'No output produced by this run.')}
                  </pre>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setActiveRun(null)}
                  className="min-h-[44px]"
                >
                  {activeRun.status === 'running' ? 'Run in Background' : 'Close'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      {modal && (
        <CronFormModal
          mode={modal.mode}
          initial={modal.job}
          onClose={() => setModal(null)}
          onSubmit={async (data) => {
            if (modal.mode === 'create') {
              await handleCreateSubmit(data);
            } else if (modal.job) {
              await handleEditSubmit(modal.job.id, data);
            }
          }}
        />
      )}

      {/* Confirmations */}
      {confirmRun && (
        <ConfirmationModal
          isOpen={true}
          onCancel={() => setConfirmRun(null)}
          onConfirm={() => runJobNow(confirmRun)}
          title="Confirm Execution"
          message={`Are you sure you want to run this cron job now?`}
          description={confirmRun.command}
          confirmLabel="Run Now"
          variant="info"
        />
      )}

      {confirmToggle && (
        <ConfirmationModal
          isOpen={true}
          onCancel={() => setConfirmToggle(null)}
          onConfirm={() => toggleJob(confirmToggle)}
          title={confirmToggle.enabled ? 'Disable Job' : 'Enable Job'}
          message={`Are you sure you want to ${confirmToggle.enabled ? 'disable' : 'enable'} this cron job?`}
          description={confirmToggle.command}
          confirmLabel={confirmToggle.enabled ? 'Disable' : 'Enable'}
          variant={confirmToggle.enabled ? 'warning' : 'info'}
        />
      )}

      {confirmDelete && (
        <ConfirmationModal
          isOpen={true}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteJob(confirmDelete)}
          title="Delete Job"
          message="Are you sure you want to delete this cron job? This action cannot be undone."
          description={confirmDelete.command}
          confirmLabel="Delete"
          variant="danger"
        />
      )}
    </div>
  );
}
