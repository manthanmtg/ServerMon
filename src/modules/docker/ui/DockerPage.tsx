'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

import type { DockerSnapshot } from '../types';
import { DockerHeader } from './components/DockerHeader';
import { DockerStats } from './components/DockerStats';
import { ResourceCharts } from './components/ResourceCharts';
import { IOCharts } from './components/IOCharts';
import { ContainerTable } from './components/ContainerTable';
import { AssetManager } from './components/AssetManager';
import { DockerTerminal } from './components/DockerTerminal';
import { DockerSidebar } from './components/DockerSidebar';

const DOCKER_SNAPSHOT_TIMEOUT_MS = 8000;

export default function DockerPage() {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<DockerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshMs, setRefreshMs] = useState(5000);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [terminalCommand, setTerminalCommand] = useState('docker ps -a\n');
  const [sessionId] = useState(() => `docker-${crypto.randomUUID()}`);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, DOCKER_SNAPSHOT_TIMEOUT_MS);

    try {
      const response = await fetch('/api/modules/docker', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch docker data');
      }
      setSnapshot(data);
      setSelectedContainerId((currentId) => currentId || data.containers[0]?.id || null);
    } catch (error: unknown) {
      const isAbortError = error instanceof DOMException && error.name === 'AbortError';
      toast({
        title: 'Docker snapshot failed',
        description: isAbortError
          ? `Docker snapshot timed out after ${DOCKER_SNAPSHOT_TIMEOUT_MS / 1000}s`
          : error instanceof Error
            ? error.message
            : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [toast]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSnapshot().finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    const interval = window.setInterval(() => {
      loadSnapshot().catch(() => {
        // Non-blocking retry loop for live dashboard updates.
      });
    }, refreshMs);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadSnapshot, refreshMs]);

  const topContainers = useMemo(
    () => [...(snapshot?.containers || [])].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 5),
    [snapshot]
  );

  const selectedContainer =
    snapshot?.containers.find((container) => container.id === selectedContainerId) ||
    snapshot?.containers[0] ||
    null;

  const ioHistory = useMemo(() => {
    if (!snapshot || !selectedContainer) return [];
    return snapshot.history.map((entry) => {
      const point = entry.containers.find((container) => container.id === selectedContainer.id);
      return {
        timestamp: new Date(entry.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        read: point?.blockReadBytes || 0,
        write: point?.blockWriteBytes || 0,
      };
    });
  }, [selectedContainer, snapshot]);

  const networkHistory = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.history.map((entry) => {
      const top = [...entry.containers]
        .sort(
          (a, b) => b.networkInBytes + b.networkOutBytes - (a.networkInBytes + a.networkOutBytes)
        )
        .slice(0, 4);
      const row: Record<string, number | string> & { timestamp: string } = {
        timestamp: new Date(entry.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      top.forEach((container, index) => {
        row[`c${index}`] = container.networkInBytes + container.networkOutBytes;
        row[`n${index}`] = container.name;
      });
      return row;
    });
  }, [snapshot]);

  async function runAction(containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') {
    if (action === 'remove' && !window.confirm('Are you sure you want to remove this container?'))
      return;
    setPendingActionId(containerId);
    try {
      const response = await fetch(`/api/modules/docker/${containerId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute action');
      }
      setTerminalCommand(`docker ${action} ${data.container?.name || containerId}\n`);
      toast({ title: `${action} complete`, description: data.message, variant: 'success' });
      await loadSnapshot();
    } catch (error: unknown) {
      toast({
        title: `Docker ${action} failed`,
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPendingActionId(null);
    }
  }

  async function deleteAsset(id: string, type: 'images' | 'volumes' | 'networks') {
    if (!window.confirm(`Are you sure you want to remove this ${type.slice(0, -1)}?`)) return;
    const url = `/api/modules/docker/${type}/${id}`;
    try {
      const response = await fetch(url, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to remove ${type.slice(0, -1)}`);
      }
      toast({ title: 'Removal complete', description: data.message, variant: 'success' });
      await loadSnapshot();
    } catch (error: unknown) {
      toast({
        title: 'Removal failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  if (loading) {
    return <PageSkeleton statCards={3} />;
  }

  return (
    <div className="space-y-6 pb-20" data-testid="docker-page">
      <DockerHeader
        snapshot={snapshot}
        refreshMs={refreshMs}
        onRefreshChange={setRefreshMs}
        onRefreshNow={() => loadSnapshot()}
      />

      <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <DockerStats snapshot={snapshot} />

        <ResourceCharts snapshot={snapshot} topContainers={topContainers} />

        <IOCharts
          snapshot={snapshot}
          selectedContainer={selectedContainer}
          ioHistory={ioHistory}
          networkHistory={networkHistory}
          onContainerChange={setSelectedContainerId}
        />

        <ContainerTable
          snapshot={snapshot}
          expandedId={expandedId}
          pendingActionId={pendingActionId}
          onExpand={setExpandedId}
          onAction={runAction}
          onLogs={(id, name) => {
            setSelectedContainerId(id);
            setTerminalCommand(`docker logs -f ${name}\n`);
          }}
          onExec={(id, name) => {
            setSelectedContainerId(id);
            setTerminalCommand(`docker exec -it ${name} sh\n`);
          }}
        />

        <AssetManager
          images={snapshot?.images || []}
          volumes={snapshot?.volumes || []}
          networks={snapshot?.networks || []}
          onDelete={deleteAsset}
        />

        <DockerTerminal
          terminalCommand={terminalCommand}
          sessionId={sessionId}
          onCommandChange={(cmd) => setTerminalCommand(cmd)}
        />

        <DockerSidebar snapshot={snapshot} />

        {!snapshot?.daemonReachable && (
          <Card className="border-destructive/40 bg-destructive/5 shadow-lg shadow-destructive/10 overflow-hidden relative">
            <div className="absolute inset-x-0 top-0 h-1 bg-destructive/20" />
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-full bg-destructive/10">
                  <Database className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="font-bold text-lg text-destructive">
                    Docker socket access required
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground opacity-90 leading-relaxed">
                    This module expects `/var/run/docker.sock` access or membership in the Docker
                    group. The UI remains available with cached or mock data, but live actions need
                    daemon permissions.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
