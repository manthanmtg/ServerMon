import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { NetworkSpeedtestResult } from '../../types';

function formatMbps(value: number | undefined) {
  return typeof value === 'number' ? `${value.toFixed(2)} Mbps` : '-';
}

function formatLatency(value: number | undefined) {
  return typeof value === 'number' ? `${value.toFixed(2)} ms` : '-';
}

function formatSpeedtestDate(value: string | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SpeedtestHistoryModal({
  history,
  chartData,
  onClose,
}: {
  history: NetworkSpeedtestResult[];
  chartData: Array<{ time: string; download: number; upload: number; ping: number }>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        aria-label="Close speedtest history"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="speedtest-history-title"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h3 id="speedtest-history-title" className="text-lg font-semibold">
              Speedtest History
            </h3>
            <p className="text-sm text-muted-foreground">
              Download, upload, and latency from manual and scheduled runs.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-5 overflow-y-auto p-5">
          <div className="h-[320px] rounded-xl border border-border/50 bg-muted/20 p-3 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <YAxis
                  yAxisId="speed"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  tickFormatter={(value) => `${value} Mbps`}
                />
                <YAxis
                  yAxisId="latency"
                  orientation="right"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  tickFormatter={(value) => `${value} ms`}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Legend />
                <Line
                  yAxisId="speed"
                  type="monotone"
                  dataKey="download"
                  name="Download Mbps"
                  stroke="var(--success)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="speed"
                  type="monotone"
                  dataKey="upload"
                  name="Upload Mbps"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="latency"
                  type="monotone"
                  dataKey="ping"
                  name="Ping ms"
                  stroke="var(--warning)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/40 shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border/50 bg-muted/30 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Down</th>
                  <th className="px-4 py-3">Up</th>
                  <th className="px-4 py-3">Ping</th>
                  <th className="px-4 py-3">Server</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {history.map((result) => (
                  <tr
                    key={result.id ?? `${result.startedAt}-${result.trigger}`}
                    className="transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatSpeedtestDate(result.finishedAt)}
                    </td>
                    <td className="px-4 py-3 capitalize">{result.trigger}</td>
                    <td className="px-4 py-3 tabular-nums">{formatMbps(result.downloadMbps)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatMbps(result.uploadMbps)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatLatency(result.pingMs)}</td>
                    <td className="max-w-[260px] truncate px-4 py-3">
                      {result.serverName || result.error || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={result.status === 'completed' ? 'success' : 'destructive'}>
                        {result.status.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
                      No speedtest history yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
