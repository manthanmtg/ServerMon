'use client';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { FLEET_LOG_LEVELS, FLEET_LOG_SERVICES } from '@/lib/fleet/enums';

interface LogEvent {
  _id: string;
  createdAt: string;
  service: string;
  level: string;
  eventType: string;
  message: string;
  nodeId?: string;
  correlationId?: string;
}

export function NodeLogsView({ nodeId }: { nodeId: string }) {
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<string>('');
  const [service, setService] = useState<string>('');
  const [eventType, setEventType] = useState<string>('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('nodeId', nodeId);
    params.set('limit', '100');
    if (level) params.set('level', level);
    if (service) params.set('service', service);
    if (eventType) params.set('eventType', eventType);
    return params.toString();
  }, [nodeId, level, service, eventType]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/fleet/logs?${query}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setEvents(data.events ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [query]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle>Logs</CardTitle>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            aria-label="Filter level"
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">All levels</option>
            {FLEET_LOG_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            aria-label="Filter service"
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">All services</option>
            {FLEET_LOG_SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="w-48">
            <Input
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="Event type"
              aria-label="Filter event type"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive mb-2"
          >
            {error}
          </div>
        )}
        {!events && (
          <div className="flex justify-center py-12">
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
                      {new Date(ev.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-1 pr-2">{ev.service}</td>
                    <td className="py-1 pr-2">
                      <Badge variant={levelVariant(ev.level)}>{ev.level}</Badge>
                    </td>
                    <td className="py-1 pr-2 font-mono">{ev.eventType}</td>
                    <td className="py-1 pr-2 break-words max-w-[40ch]">{ev.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function levelVariant(
  level: string
): 'default' | 'destructive' | 'warning' | 'success' | 'outline' {
  if (level === 'error') return 'destructive';
  if (level === 'warn') return 'warning';
  if (level === 'audit') return 'success';
  return 'outline';
}
