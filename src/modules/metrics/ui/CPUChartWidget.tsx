'use client';

import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CPUMetric {
  cpu: number;
  timestamp: string;
}

function isCPUMetric(value: unknown): value is CPUMetric {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.cpu === 'number' &&
    Number.isFinite(candidate.cpu) &&
    typeof candidate.timestamp === 'string'
  );
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

interface Props {
  externalData?: CPUMetric[];
}

export default function CPUChartWidget({ externalData }: Props) {
  const [internalData, setInternalData] = useState<CPUMetric[]>([]);
  const data = externalData || internalData;

  useEffect(() => {
    if (externalData) return;

    const es = new EventSource('/api/metrics/stream');
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!isCPUMetric(payload)) return;

        const metric: CPUMetric = {
          cpu: clampPercent(payload.cpu),
          timestamp: payload.timestamp,
        };

        setInternalData((prev) => [...prev, metric].slice(-30));
      } catch {
        return;
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [externalData]);

  if (data.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full w-full items-center justify-center"
      >
        <div className="flex min-h-[44px] items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 text-sm text-muted-foreground shadow-sm">
          <span className="h-2 w-2 rounded-full bg-primary/70 animate-pulse" aria-hidden="true" />
          <span>Waiting for data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
            opacity={0.5}
          />
          <XAxis dataKey="timestamp" hide />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            unit="%"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
            itemStyle={{ color: 'var(--primary)' }}
            labelStyle={{ display: 'none' }}
          />
          <Area
            type="monotone"
            dataKey="cpu"
            stroke="var(--primary)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#cpuGrad)"
            isAnimationActive={false}
            name="CPU"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
