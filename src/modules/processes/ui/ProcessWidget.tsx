'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonCard, SkeletonTable } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
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
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProcs = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const res = await fetch(
          `/api/modules/processes?limit=50&sort=${sortField}&search=${encodeURIComponent(
            debouncedSearch
          )}`
        );
        const data = await res.json();
        setProcesses(data.processes || []);
        if (data.summary) setSummary(data.summary);
      } catch {
        // silent fail on auto-refresh
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [sortField, debouncedSearch]
  );

  useEffect(() => {
    fetchProcs();
    const interval = setInterval(() => fetchProcs(), 5000);
    return () => clearInterval(interval);
  }, [fetchProcs]);

  const killProcess = useCallback(
    async (pid: number, signal: string) => {
      setKillingPid(pid);
      try {
        const res = await fetch('/api/modules/processes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pid, signal }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast({ title: `Sent ${signal} to PID ${pid}`, variant: 'success' });
        setTimeout(() => fetchProcs(), 1000);
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
        <div className="relative flex-1 sm:max-w-xs">
          <label htmlFor="process-search" className="sr-only">
            Search processes
          </label>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id="process-search"
            type="text"
            placeholder="Search by name, PID, user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchProcs(true)} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
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
