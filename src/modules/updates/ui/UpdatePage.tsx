'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  Download,
  History,
  Info,
  Loader2,
  Package,
  Play,
  RefreshCcw,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { cn } from '@/lib/utils';
import type { UpdateSnapshot } from '../types';
import type { UpdateRunStatus } from '@/types/updates';

type UpdatePhase = 'idle' | 'confirming' | 'running' | 'completed' | 'failed';

export default function UpdatePage() {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const { toast } = useToast();

  // Update run state
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<UpdateRunStatus | null>(null);
  const [runHistory, setRunHistory] = useState<UpdateRunStatus[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryRun, setSelectedHistoryRun] = useState<UpdateRunStatus | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const loadSnapshot = useCallback(
    async (force: boolean = false) => {
      try {
        const res = await fetch('/api/modules/updates', {
          method: force ? 'POST' : 'GET',
          body: force ? JSON.stringify({ force: true }) : undefined,
          headers: force ? { 'Content-Type': 'application/json' } : undefined,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSnapshot(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast({
          title: 'Failed to fetch updates',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setChecking(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  // Load run history
  const loadRunHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/updates/run');
      if (!res.ok) return;
      const data = await res.json();
      if (data.runs) setRunHistory(data.runs);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadRunHistory();
  }, [loadRunHistory]);

  // Poll active run status
  useEffect(() => {
    if (!activeRunId || phase === 'idle' || phase === 'confirming') return;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/modules/updates/run?runId=${activeRunId}`);
        if (!res.ok) return;
        const data: UpdateRunStatus = await res.json();
        setActiveRun(data);

        if (data.status === 'completed') {
          setPhase('completed');
          loadSnapshot(true);
          loadRunHistory();
        } else if (data.status === 'failed') {
          setPhase('failed');
          loadRunHistory();
        }
      } catch {
        /* ignore polling errors */
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [activeRunId, phase, loadSnapshot, loadRunHistory]);

  // Auto-scroll log viewer (only within log container)
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activeRun?.logContent, autoScroll]);

  const handleCheckUpdates = () => {
    setChecking(true);
    loadSnapshot(true);
  };

  const handleTriggerUpdate = async () => {
    setPhase('running');
    try {
      const res = await fetch('/api/modules/updates/run', { method: 'POST' });
      const data = await res.json();

      if (data.success && data.runId) {
        setActiveRunId(data.runId);
        toast({
          title: 'Update started',
          description: 'Tracking progress in real-time...',
          variant: 'success',
        });
      } else {
        setPhase('failed');
        toast({
          title: 'Failed to start update',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setPhase('failed');
      toast({
        title: 'Failed to start update',
        description: error instanceof Error ? error.message : 'Network error',
        variant: 'destructive',
      });
    }
  };

  const handleViewHistoryRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/modules/updates/run?runId=${runId}`);
      if (!res.ok) return;
      const data: UpdateRunStatus = await res.json();
      setSelectedHistoryRun(data);
    } catch {
      /* ignore */
    }
  };

  const handleDismissProgress = () => {
    setPhase('idle');
    setActiveRunId(null);
    setActiveRun(null);
  };

  const historyData = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.history].reverse().map((h) => ({
      timestamp: new Date(h.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      count: h.count,
      success: h.success ? 1 : 0,
    }));
  }, [snapshot]);

  const formatElapsed = (startedAt: string, finishedAt?: string) => {
    const start = new Date(startedAt).getTime();
    const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
    const secs = Math.floor((end - start) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}m ${remSecs}s`;
  };

  if (loading && !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 animate-fade-in">
        <Spinner size="lg" />
        <p className="text-sm text-muted-foreground">Loading updates...</p>
      </div>
    );
  }

  const counts = snapshot?.counts || { security: 0, regular: 0, optional: 0, language: 0 };
  const totalUpdates = counts.security + counts.regular + counts.optional + counts.language;

  const isRunning = phase === 'running' && activeRun?.status === 'running';

  return (
    <div className="space-y-6 container mx-auto py-6 animate-in fade-in duration-500">
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={phase === 'confirming'}
        onConfirm={handleTriggerUpdate}
        onCancel={() => setPhase('idle')}
        title="Install System Updates"
        message={`This will install ${totalUpdates} package update${totalUpdates !== 1 ? 's' : ''} on the system. The process runs in the background and you can monitor its progress in real-time.`}
        description={
          counts.security > 0
            ? `Includes ${counts.security} security update${counts.security !== 1 ? 's' : ''} (recommended)`
            : undefined
        }
        confirmLabel="Install Updates"
        cancelLabel="Cancel"
        variant="warning"
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/50 backdrop-blur-sm p-6 rounded-2xl border border-border/50">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">System Updates</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10">
                  {snapshot?.osName} {snapshot?.osVersion}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last checked: {snapshot ? new Date(snapshot.lastCheck).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 h-10 px-3 rounded-xl text-muted-foreground hover:text-foreground"
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) loadRunHistory();
            }}
          >
            <History className="w-4 h-4" />
            History
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-10 px-4 rounded-xl hover:bg-primary/5 hover:text-primary transition-all active:scale-95"
            onClick={handleCheckUpdates}
            disabled={checking}
          >
            <RefreshCcw className={cn('w-4 h-4', checking && 'animate-spin')} />
            {checking ? 'Checking...' : 'Check for Updates'}
          </Button>
          {totalUpdates > 0 && (
            <Button
              size="sm"
              className="gap-2 h-10 px-5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-95"
              onClick={() => setPhase('confirming')}
              disabled={isRunning}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Update All
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Live Progress Panel */}
      {(phase === 'running' || phase === 'completed' || phase === 'failed') && activeRun && (
        <Card
          className={cn(
            'overflow-hidden border-2 animate-in slide-in-from-top-2 duration-500',
            phase === 'running'
              ? 'border-primary/30 shadow-lg shadow-primary/10'
              : phase === 'completed'
                ? 'border-success/30 shadow-lg shadow-success/10'
                : 'border-destructive/30 shadow-lg shadow-destructive/10'
          )}
        >
          <div
            className={cn(
              'px-6 py-4 flex items-center justify-between',
              phase === 'running'
                ? 'bg-primary/5'
                : phase === 'completed'
                  ? 'bg-success/5'
                  : 'bg-destructive/5'
            )}
          >
            <div className="flex items-center gap-3">
              {phase === 'running' && (
                <div className="relative">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <div className="absolute inset-0 bg-primary/20 blur-md rounded-full animate-pulse" />
                </div>
              )}
              {phase === 'completed' && <CheckCircle2 className="w-5 h-5 text-success" />}
              {phase === 'failed' && <XCircle className="w-5 h-5 text-destructive" />}
              <div>
                <h3 className="text-sm font-bold">
                  {phase === 'running'
                    ? 'Installing Updates...'
                    : phase === 'completed'
                      ? 'Updates Installed Successfully'
                      : 'Update Failed'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {phase === 'running' ? (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      Running for {formatElapsed(activeRun.startedAt)}
                    </span>
                  ) : (
                    <span>
                      Completed in{' '}
                      {formatElapsed(activeRun.startedAt, activeRun.finishedAt)}
                      {activeRun.exitCode !== null && activeRun.exitCode !== 0 && (
                        <span className="ml-2 text-destructive">
                          (exit code {activeRun.exitCode})
                        </span>
                      )}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {phase === 'running' && (
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] uppercase font-bold tracking-wider animate-pulse">
                  Live
                </Badge>
              )}
              {phase !== 'running' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs rounded-lg"
                  onClick={handleDismissProgress}
                >
                  Dismiss
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar for running state */}
          {phase === 'running' && (
            <div className="h-1 bg-muted/30 overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-progress-indeterminate" />
            </div>
          )}

          {/* Log Output */}
          {activeRun.logContent && (
            <div className="relative">
              <div ref={logContainerRef} className="max-h-80 overflow-y-auto p-4 font-mono text-xs leading-relaxed scrollbar-none bg-gradient-to-b from-black/80 to-black/60">
                <pre className="text-green-400/90 whitespace-pre-wrap break-all">
                  {activeRun.logContent}
                </pre>
              </div>
              {phase === 'running' && (
                <button
                  className={cn(
                    'absolute bottom-3 right-3 p-1.5 rounded-lg bg-card/80 backdrop-blur border border-border/50 text-muted-foreground hover:text-foreground transition-all',
                    autoScroll && 'text-primary'
                  )}
                  onClick={() => setAutoScroll(!autoScroll)}
                  title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Waiting for output */}
          {phase === 'running' && !activeRun.logContent && (
            <div className="flex items-center justify-center gap-3 py-8 bg-black/90">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              <span className="text-xs text-muted-foreground">
                Waiting for output...
              </span>
            </div>
          )}
        </Card>
      )}

      {/* Run History Panel */}
      {showHistory && (
        <Card className="animate-in slide-in-from-top-2 duration-300 border-border/50">
          <CardHeader className="px-6 py-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-primary" />
                <CardTitle className="text-base font-bold">Update Run History</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
                {runHistory.length} run{runHistory.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {runHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Terminal className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No update runs recorded yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/20 max-h-[300px] overflow-auto">
                {runHistory.map((run) => (
                  <button
                    key={run.runId}
                    className={cn(
                      'w-full flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-all text-left cursor-pointer',
                      selectedHistoryRun?.runId === run.runId && 'bg-primary/5'
                    )}
                    onClick={() => handleViewHistoryRun(run.runId)}
                  >
                    <div className="flex items-center gap-3">
                      {run.status === 'completed' && (
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                      )}
                      {run.status === 'failed' && (
                        <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      )}
                      {run.status === 'running' && (
                        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(run.startedAt).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          PID {run.pid}
                          {run.finishedAt &&
                            ` \u00B7 ${formatElapsed(run.startedAt, run.finishedAt)}`}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] uppercase font-bold tracking-wider',
                        run.status === 'completed'
                          ? 'border-success/30 text-success'
                          : run.status === 'failed'
                            ? 'border-destructive/30 text-destructive'
                            : 'border-primary/30 text-primary'
                      )}
                    >
                      {run.status}
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            {/* Selected history run log */}
            {selectedHistoryRun?.logContent && (
              <div className="border-t border-border/50">
                <div className="px-6 py-3 flex items-center justify-between bg-muted/20">
                  <span className="text-xs font-medium text-muted-foreground">
                    Log output for {new Date(selectedHistoryRun.startedAt).toLocaleString()}
                  </span>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => setSelectedHistoryRun(null)}
                  >
                    Close
                  </button>
                </div>
                <div className="max-h-[250px] overflow-auto bg-black/90 p-4 font-mono text-xs leading-relaxed">
                  <pre className="text-green-400/90 whitespace-pre-wrap break-all">
                    {selectedHistoryRun.logContent}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden relative group transition-all hover:shadow-lg hover:shadow-destructive/5 hover:border-destructive/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Security Updates</p>
                <p className="text-3xl font-bold tracking-tight text-destructive">
                  {counts.security}
                </p>
              </div>
              <div className="p-3 bg-destructive/10 rounded-2xl group-hover:scale-110 transition-transform">
                <ShieldAlert className="w-6 h-6 text-destructive" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-destructive/20 text-destructive text-[10px] uppercase font-bold tracking-widest px-2 py-0.5"
              >
                High Priority
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden relative group transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Regular Updates</p>
                <p className="text-3xl font-bold tracking-tight text-primary">{counts.regular}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform">
                <RotateCcw className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-primary/20 text-primary text-[10px] uppercase font-bold tracking-widest px-2 py-0.5"
              >
                Pending
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden relative group transition-all hover:shadow-lg hover:shadow-accent/5 hover:border-accent/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Package Managers</p>
                <p className="text-3xl font-bold tracking-tight text-accent">{counts.language}</p>
              </div>
              <div className="p-3 bg-accent/10 rounded-2xl group-hover:scale-110 transition-transform">
                <Info className="w-6 h-6 text-accent" />
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">NPM, PIP, etc.</p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden relative group transition-all hover:shadow-lg',
            snapshot?.pendingRestart
              ? 'hover:shadow-warning/5 hover:border-warning/20'
              : 'hover:shadow-success/5 hover:border-success/20'
          )}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Reboot Required</p>
                <p
                  className={cn(
                    'text-3xl font-bold tracking-tight',
                    snapshot?.pendingRestart ? 'text-warning' : 'text-success'
                  )}
                >
                  {snapshot?.pendingRestart ? 'Yes' : 'No'}
                </p>
              </div>
              <div
                className={cn(
                  'p-3 rounded-2xl group-hover:scale-110 transition-transform',
                  snapshot?.pendingRestart ? 'bg-warning/10' : 'bg-success/10'
                )}
              >
                {snapshot?.pendingRestart ? (
                  <AlertTriangle className="w-6 h-6 text-warning" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-success" />
                )}
              </div>
            </div>
            {snapshot?.pendingRestart && (
              <p className="mt-4 text-xs text-warning truncate">
                Required by: {snapshot.restartRequiredBy[0] || 'Kernel update'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Available Updates Table */}
        <Card className="lg:col-span-2 bg-card/20 backdrop-blur-xl border border-white/5 flex flex-col h-[600px] overflow-hidden shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5 border-b border-border/50 bg-white/5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-primary" />
                <CardTitle className="text-xl font-bold tracking-tight">
                  Available Updates
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                System and package updates ready for installation
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-primary/20 text-primary border-primary/30 font-bold px-3 py-1">
                {totalUpdates} Total
              </Badge>
              {totalUpdates > 0 && (
                <Button
                  size="sm"
                  className="h-9 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95"
                  onClick={() => setPhase('confirming')}
                  disabled={isRunning}
                >
                  {isRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {isRunning ? 'Updating...' : 'Update All'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto bg-black/5">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-background/40 backdrop-blur-2xl border-b border-border/50 z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                    Package Info
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 text-center">
                    Version Journey
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                    System
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 text-right">
                    Severity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {snapshot?.updates.map((update, i) => (
                  <tr key={i} className="group hover:bg-primary/[0.03] transition-all duration-300">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-muted/30 rounded-xl group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-300">
                          {update.manager === 'apt' ? (
                            <Cpu className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                          ) : (
                            <Box className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                            {update.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium">
                            {update.repository}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-6">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-tighter">
                            From
                          </span>
                          <code className="text-[11px] px-2 py-0.5 bg-muted/30 rounded text-muted-foreground font-mono">
                            {update.currentVersion}
                          </code>
                        </div>
                        <div className="relative flex items-center justify-center">
                          <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full animate-pulse group-hover:bg-primary/40 transition-all" />
                          <ArrowRight className="w-4 h-4 text-primary relative z-10 group-hover:translate-x-1 transition-transform" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[9px] font-black text-success/60 uppercase tracking-tighter">
                            To
                          </span>
                          <code className="text-[11px] px-2 py-0.5 bg-success/10 rounded border border-success/20 text-success font-mono font-bold">
                            {update.newVersion}
                          </code>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-bold tracking-tighter bg-muted/20 border-border/50 py-0 h-5"
                        >
                          {update.manager}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Badge
                        className={cn(
                          'text-[9px] uppercase font-black tracking-widest px-2 py-0.5 border-0 shadow-sm',
                          update.severity === 'critical'
                            ? 'bg-destructive text-destructive-foreground'
                            : update.severity === 'high'
                              ? 'bg-orange-500 text-white'
                              : update.severity === 'medium'
                                ? 'bg-warning text-warning-foreground'
                                : 'bg-primary text-primary-foreground'
                        )}
                      >
                        {update.severity}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {snapshot?.updates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-24 text-center">
                      <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-500">
                        <div className="p-4 bg-success/10 rounded-full shadow-inner">
                          <ShieldCheck className="w-12 h-12 text-success" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-xl font-bold bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
                            System is Secure
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            All packages are running the latest versions.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Update History Chart */}
          <Card className="bg-card/30 backdrop-blur-md border border-border/50">
            <CardHeader className="px-6 py-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                <CardTitle className="text-base font-bold">Update Trends</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient id="installedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.05)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="timestamp"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: 'gray' }}
                    />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderRadius: '12px',
                        border: '1px solid hsl(var(--border))',
                      }}
                      itemStyle={{ fontSize: '10px' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="var(--primary)"
                      fillOpacity={1}
                      fill="url(#installedGradient)"
                      name="Packages Updated"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Recent Runs Quick View */}
          <Card className="bg-card/30 backdrop-blur-md border border-border/50">
            <CardHeader className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base font-bold">Recent Runs</CardTitle>
                </div>
                {runHistory.length > 0 && (
                  <button
                    className="text-[10px] uppercase font-bold tracking-wider text-primary hover:text-primary/80 transition-colors cursor-pointer"
                    onClick={() => {
                      setShowHistory(true);
                      loadRunHistory();
                    }}
                  >
                    View All
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-4">
              {runHistory.length === 0 ? (
                <div className="text-center py-6">
                  <Terminal className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No runs yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {runHistory.slice(0, 5).map((run) => (
                    <button
                      key={run.runId}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/30 transition-all text-left cursor-pointer"
                      onClick={() => {
                        setShowHistory(true);
                        handleViewHistoryRun(run.runId);
                      }}
                    >
                      {run.status === 'completed' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                      )}
                      {run.status === 'failed' && (
                        <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      )}
                      {run.status === 'running' && (
                        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {new Date(run.startedAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'text-[9px] font-bold uppercase tracking-wider',
                          run.status === 'completed'
                            ? 'text-success'
                            : run.status === 'failed'
                              ? 'text-destructive'
                              : 'text-primary'
                        )}
                      >
                        {run.status === 'running'
                          ? formatElapsed(run.startedAt)
                          : formatElapsed(run.startedAt, run.finishedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
