'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { FLEET_LOG_LEVELS, FLEET_LOG_SERVICES } from '@/lib/fleet/enums';

interface LogEvent {
  _id: string;
  createdAt: string;
  service?: string;
  level?: string;
  eventType?: string;
  message?: string;
  nodeId?: string;
  routeId?: string;
  audit?: boolean;
}

function levelVariant(level: string | undefined): BadgeVariant {
  if (level === 'error') return 'destructive';
  if (level === 'warn') return 'warning';
  if (level === 'audit') return 'success';
  return 'outline';
}

interface Filters {
  nodeId: string;
  routeId: string;
  service: string;
  level: string;
  eventType: string;
  since: string;
  until: string;
  audit: boolean;
}

const INITIAL_FILTERS: Filters = {
  nodeId: '',
  routeId: '',
  service: '',
  level: '',
  eventType: '',
  since: '',
  until: '',
  audit: false,
};

export function FleetLogsPage() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '100');
    if (filters.nodeId) params.set('nodeId', filters.nodeId);
    if (filters.routeId) params.set('routeId', filters.routeId);
    if (filters.service) params.set('service', filters.service);
    if (filters.level) params.set('level', filters.level);
    if (filters.eventType) params.set('eventType', filters.eventType);
    if (filters.since) params.set('since', filters.since);
    if (filters.until) params.set('until', filters.until);
    if (filters.audit) params.set('audit', 'true');
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  }, [filters, cursor]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fleet/logs?${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setNextCursor(data.nextCursor ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(() => {
      setCursor('');
      load();
    }, 5000);
    return () => clearInterval(iv);
  }, [autoRefresh, load]);

  const goNext = () => {
    if (nextCursor) setCursor(nextCursor);
  };
  const resetCursor = () => setCursor('');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle>Fleet logs</CardTitle>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh (5s)
        </label>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Input
            label="Node ID"
            value={filters.nodeId}
            onChange={(e) => setFilters({ ...filters, nodeId: e.target.value })}
          />
          <Input
            label="Route ID"
            value={filters.routeId}
            onChange={(e) => setFilters({ ...filters, routeId: e.target.value })}
          />
          <div className="space-y-1.5">
            <label htmlFor="logs-service" className="block text-sm font-medium text-foreground">
              Service
            </label>
            <select
              id="logs-service"
              value={filters.service}
              onChange={(e) => setFilters({ ...filters, service: e.target.value })}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All services</option>
              {FLEET_LOG_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="logs-level" className="block text-sm font-medium text-foreground">
              Level
            </label>
            <select
              id="logs-level"
              value={filters.level}
              onChange={(e) => setFilters({ ...filters, level: e.target.value })}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All levels</option>
              {FLEET_LOG_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Event type"
            value={filters.eventType}
            onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
          />
          <Input
            label="Since"
            type="datetime-local"
            value={filters.since}
            onChange={(e) => setFilters({ ...filters, since: e.target.value })}
          />
          <Input
            label="Until"
            type="datetime-local"
            value={filters.until}
            onChange={(e) => setFilters({ ...filters, until: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm pt-5">
            <input
              type="checkbox"
              checked={filters.audit}
              onChange={(e) => setFilters({ ...filters, audit: e.target.checked })}
            />
            Audit only
          </label>
        </div>
        <div className="flex gap-2">
          <Button onClick={resetCursor} variant="outline">
            Apply filters
          </Button>
          <Button
            onClick={() => {
              setFilters(INITIAL_FILTERS);
              setCursor('');
            }}
            variant="ghost"
          >
            Reset
          </Button>
        </div>
        {!events && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {events && events.length === 0 && (
          <p className="text-sm text-muted-foreground">No log events.</p>
        )}
        {events && events.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Time</th>
                  <th className="py-2 pr-2 font-medium">Service</th>
                  <th className="py-2 pr-2 font-medium">Level</th>
                  <th className="py-2 pr-2 font-medium">Event</th>
                  <th className="py-2 pr-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev._id} className="border-b border-border/40 last:border-none">
                    <td className="py-1 pr-2 text-muted-foreground whitespace-nowrap font-mono">
                      {new Date(ev.createdAt).toLocaleString()}
                    </td>
                    <td className="py-1 pr-2">{ev.service ?? '—'}</td>
                    <td className="py-1 pr-2">
                      <Badge variant={levelVariant(ev.level)}>{ev.level ?? '—'}</Badge>
                    </td>
                    <td className="py-1 pr-2 font-mono">{ev.eventType ?? '—'}</td>
                    <td className="py-1 pr-2 break-words max-w-[40ch]">{ev.message ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {nextCursor && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={goNext}>
              Next page
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
