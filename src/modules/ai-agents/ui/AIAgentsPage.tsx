'use client';

import { useCallback, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import type { AgentSession } from '../types';
import { PAGE_POLL_INTERVAL_MS } from './constants';
import { SummaryCards } from './components/SummaryCards';
import { SessionFilters, type FilterAgent, type FilterStatus } from './components/SessionFilters';
import { SessionList } from './components/SessionList';
import { SessionDetail } from './components/SessionDetail';
import { useAgentsSnapshot } from './useAgentsSnapshot';

function matchesSearch(session: AgentSession, query: string): boolean {
  return (
    session.agent.displayName.toLowerCase().includes(query) ||
    (session.environment.repository ?? '').toLowerCase().includes(query) ||
    session.owner.user.toLowerCase().includes(query) ||
    session.environment.workingDirectory.toLowerCase().includes(query)
  );
}

export default function AIAgentsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterAgent, setFilterAgent] = useState<FilterAgent>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleSnapshotError = useCallback(() => {
    toast({ title: 'Failed to load AI agents', variant: 'destructive' });
  }, [toast]);

  const { snapshot, loading, refreshing, refresh } = useAgentsSnapshot({
    pollIntervalMs: PAGE_POLL_INTERVAL_MS,
    onError: handleSnapshotError,
  });

  const trimmedSearch = search.trim().toLowerCase();

  const filteredSessions = useMemo(() => {
    let sessions = snapshot?.sessions ?? [];
    if (filterStatus !== 'all') sessions = sessions.filter((s) => s.status === filterStatus);
    if (filterAgent !== 'all') sessions = sessions.filter((s) => s.agent.type === filterAgent);
    if (trimmedSearch) sessions = sessions.filter((s) => matchesSearch(s, trimmedSearch));
    return sessions;
  }, [snapshot, filterStatus, filterAgent, trimmedSearch]);

  const filteredPastSessions = useMemo(() => {
    let sessions = snapshot?.pastSessions ?? [];
    if (filterAgent !== 'all') sessions = sessions.filter((s) => s.agent.type === filterAgent);
    if (trimmedSearch) sessions = sessions.filter((s) => matchesSearch(s, trimmedSearch));
    return sessions;
  }, [snapshot, filterAgent, trimmedSearch]);

  const selectedSession = useMemo(() => {
    if (!selectedId) return null;
    return (
      filteredSessions.find((s) => s.id === selectedId) ??
      filteredPastSessions.find((s) => s.id === selectedId) ??
      null
    );
  }, [filteredSessions, filteredPastSessions, selectedId]);

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);
  const handleClose = useCallback(() => setSelectedId(null), []);

  const handleTerminate = useCallback(async () => {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/modules/ai-agents/${encodeURIComponent(selectedId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast({ title: 'Session terminated', variant: 'success' });
        setSelectedId(null);
        refresh();
      } else {
        toast({ title: 'Failed to terminate session', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to terminate session', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  }, [selectedId, toast, refresh]);

  const handleKill = useCallback(async () => {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/modules/ai-agents/${encodeURIComponent(selectedId)}/kill`, {
        method: 'POST',
      });
      if (res.ok) {
        toast({ title: 'Session killed', variant: 'success' });
        setSelectedId(null);
        refresh();
      } else {
        toast({ title: 'Failed to kill session', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to kill session', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  }, [selectedId, toast, refresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCcw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedSession) {
    return (
      <SessionDetail
        session={selectedSession}
        onClose={handleClose}
        onTerminate={handleTerminate}
        onKill={handleKill}
        actionLoading={actionLoading}
      />
    );
  }

  const hasFilters = Boolean(trimmedSearch) || filterStatus !== 'all' || filterAgent !== 'all';

  return (
    <div className="space-y-4">
      <SummaryCards snapshot={snapshot} />
      <SessionFilters
        search={search}
        onSearchChange={setSearch}
        filterStatus={filterStatus}
        onStatusChange={setFilterStatus}
        filterAgent={filterAgent}
        onAgentChange={setFilterAgent}
        onRefresh={refresh}
        refreshing={refreshing}
      />
      <SessionList
        activeSessions={filteredSessions}
        pastSessions={filteredPastSessions}
        onSelect={handleSelect}
        hasFilters={hasFilters}
      />
    </div>
  );
}
