'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface MetricsSample {
  timestamp: string;
  cpuLoad: number;
  ramUsed: number;
}

interface RawEvent {
  _id: string;
  createdAt: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}

export function toSamples(events: RawEvent[]): MetricsSample[] {
  const samples: MetricsSample[] = [];
  for (const ev of events) {
    const md = (ev.metadata ?? {}) as Record<string, unknown>;
    const cpuLoad = typeof md.cpuLoad === 'number' ? md.cpuLoad : undefined;
    const ramUsed = typeof md.ramUsed === 'number' ? md.ramUsed : undefined;
    if (cpuLoad === undefined && ramUsed === undefined) continue;
    samples.push({
      timestamp: new Date(ev.createdAt).toLocaleTimeString(),
      cpuLoad: cpuLoad ?? 0,
      ramUsed: ramUsed ?? 0,
    });
  }
  return samples.reverse();
}

export function NodeHardwareCharts({ nodeId }: { nodeId: string }) {
  const [samples, setSamples] = useState<MetricsSample[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/fleet/logs?nodeId=${encodeURIComponent(nodeId)}&eventType=metrics_sample&limit=100`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setSamples(toSamples(data.events ?? []));
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
  }, [nodeId]);

  if (!samples)
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>CPU load</CardTitle>
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
          {samples.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No metrics yet.</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={samples} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cpuLoad"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name="CPU"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>RAM used</CardTitle>
        </CardHeader>
        <CardContent>
          {samples.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No metrics yet.</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={samples} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="ramUsed"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name="RAM"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
