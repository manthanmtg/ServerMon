'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { isAbortError, resilientFetch } from '@/lib/fetch-utils';
import { ProcessList } from './components/ProcessList';
import { ProcessSummaryGrid } from './components/ProcessSummaryGrid';
import type { ProcessInfo, ProcessSortField, ProcessSummary } from './types';

export default function ProcessWidget() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [summary, setSummary] = useState<ProcessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState<ProcessSortField>('cpu');
  const [expandedPid, setExpandedPid] = useState<number | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const postKillRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    return () => {
      if (postKillRefreshTimerRef.current !== null) {
        clearTimeout(postKillRefreshTimerRef.current);
        postKillRefreshTimerRef.current = null;
      }
    };
  }, [search, sortField]);

  const fetchProcs = useCallback(
    async (isManual = false, showError = isManual) => {
      activeRequestRef.current?.abort();
      const controller = new AbortController();
      activeRequestRef.current = controller;
      const requestId = ++requestSequence.current;
      const isCurrentRequest = () =>
        !controller.signal.aborted && requestId === requestSequence.current;

      setRefreshing(isManual);
      try {
        const res = await resilientFetch(
          `/api/modules/processes?limit=50&sort=${sortField}&search=${encodeURIComponent(
            debouncedSearch
          )}`,
          { timeout: 8000, signal: controller.signal }
        );
        const data = await res.json();
        if (!res.ok) {
          const message =
            typeof data?.error === 'string'
              ? data.error
              : `Failed to load processes (${res.status})`;
          throw new Error(message);
        }
        if (!isCurrentRequest()) return;
        setProcesses(data.processes || []);
        setSummary(data.summary || null);
      } catch (err) {
        if (isAbortError(err) || !isCurrentRequest()) return;
        if (showError) {
          toast({
            title: err instanceof Error ? err.message : 'Failed to load processes',
            variant: 'destructive',
          });
        }
      } finally {
        if (!isCurrentRequest()) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [sortField, debouncedSearch, toast]
  );

  useEffect(() => {
    fetchProcs(false, true);
    const interval = setInterval(() => fetchProcs(), 5000);
    return () => {
      clearInterval(interval);
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
    };
  }, [fetchProcs]);

  const killProcess = useCallback(
    async (pid: number, signal: string) => {
      setKillingPid(pid);
      try {
        const res = await resilientFetch('/api/modules/processes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid, signal }),
          timeout: 5000,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast({ title: `Sent ${signal} to PID ${pid}`, variant: 'success' });
        if (postKillRefreshTimerRef.current !== null) {
          clearTimeout(postKillRefreshTimerRef.current);
        }
        postKillRefreshTimerRef.current = setTimeout(() => {
          postKillRefreshTimerRef.current = null;
          void fetchProcs();
        }, 1000);
      } catch (err) {
        toast({
          title: err instanceof Error ? err.message : 'Failed to kill process',
          variant: 'destructive',
        });
      } finally {
        setKillingPid(null);
      }
    },
    [fetchProcs, toast]
  );

  const toggleExpanded = useCallback((pid: number) => {
    setExpandedPid((curr) => (curr === pid ? null : pid));
  }, []);

  const toggleSort = useCallback((field: ProcessSortField) => {
    setSortField(field);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} data-testid={`skeleton-card-${i}`}>
              <SkeletonCard />
            </div>
          ))}
        </div>
        <SkeletonTable rows={8} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary && <ProcessSummaryGrid summary={summary} />}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="flex-1 sm:max-w-xs">
          <Input
            id="process-search"
            type="text"
            placeholder="Search by name, PID, user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
            className="h-9"
            aria-label="Search processes"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchProcs(true)}
          className="gap-1.5"
          loading={refreshing}
        >
          {!refreshing && <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          Refresh
        </Button>
      </div>

      <ProcessList
        processes={processes}
        sortField={sortField}
        expandedPid={expandedPid}
        killingPid={killingPid}
        onToggleSort={toggleSort}
        onToggleExpanded={toggleExpanded}
        onKillProcess={killProcess}
      />
    </div>
  );
}
