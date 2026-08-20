'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OperationLogViewer } from '@/components/operations/OperationLogViewer';
import type { ServiceLogEntry } from '../../types';

interface ServiceLogPanelProps {
  serviceName: string;
}

function formatLogTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: 'short',
    day: 'numeric',
  });
}

const serviceLogPriorities = new Set<ServiceLogEntry['priority']>([
  'emerg',
  'alert',
  'crit',
  'err',
  'warning',
  'notice',
  'info',
  'debug',
]);

function isServiceLogEntry(entry: unknown): entry is ServiceLogEntry {
  if (!entry || typeof entry !== 'object') return false;

  const candidate = entry as Record<string, unknown>;

  return (
    typeof candidate.timestamp === 'string' &&
    !Number.isNaN(Date.parse(candidate.timestamp)) &&
    typeof candidate.priority === 'string' &&
    serviceLogPriorities.has(candidate.priority as ServiceLogEntry['priority']) &&
    typeof candidate.message === 'string' &&
    typeof candidate.unit === 'string'
  );
}

function parseServiceLogEntries(data: unknown): ServiceLogEntry[] {
  if (!data || typeof data !== 'object') return [];

  const logs = (data as { logs?: unknown }).logs;

  return Array.isArray(logs) ? logs.filter(isServiceLogEntry) : [];
}

export function ServiceLogPanel({ serviceName }: ServiceLogPanelProps) {
  const [logs, setLogs] = useState<ServiceLogEntry[] | null>(null);
  const [follow, setFollow] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestControllerRef = useRef<AbortController | null>(null);

  const loadLogs = useCallback(() => {
    requestControllerRef.current?.abort();
    const requestController = new AbortController();
    requestControllerRef.current = requestController;

    fetch(`/api/modules/services/${encodeURIComponent(serviceName)}/logs?lines=30`, {
      cache: 'no-store',
      signal: requestController.signal,
    })
      .then((r) => r.json())
      .then((data: unknown) => {
        const nextLogs = parseServiceLogEntries(data);
        if (!mountedRef.current) return;

        setLoadError(null);
        setLogs(nextLogs);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!mountedRef.current) return;

        setLoadError('Unable to load service logs.');
      })
      .finally(() => {
        if (!mountedRef.current) return;
        if (requestControllerRef.current === requestController) {
          requestControllerRef.current = null;
        }
      });
  }, [serviceName]);

  useEffect(() => {
    mountedRef.current = true;
    if (follow) loadLogs();
    const interval = follow ? setInterval(loadLogs, 5000) : null;

    return () => {
      mountedRef.current = false;
      requestControllerRef.current?.abort();
      if (interval) clearInterval(interval);
    };
  }, [follow, loadLogs]);

  const loading = logs === null;

  if (loadError && logs === null) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
        <p className="mb-2">{loadError}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void loadLogs()}
          className="min-h-[44px]"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const output = logs
    .map(
      (entry) =>
        `[${formatLogTimestamp(entry.timestamp)}] [${entry.priority.toUpperCase()}] [${entry.unit}] ${entry.message}`
    )
    .join('\n');

  return (
    <OperationLogViewer
      output={output}
      status="running"
      label={`${serviceName} service logs`}
      follow={follow}
      onFollowChange={setFollow}
      error={loadError}
      emptyMessage="No logs available."
      downloadableFilename={`${serviceName}.log`}
      maxHeightClassName="max-h-[240px]"
    />
  );
}
