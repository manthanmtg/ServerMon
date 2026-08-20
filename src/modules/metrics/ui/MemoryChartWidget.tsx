'use client';

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useMetrics } from '@/lib/MetricsContext';

interface MemoryMetric {
  memory: number;
  timestamp: string;
}

interface Props {
  externalData?: MemoryMetric[];
}

function isMemoryMetric(value: unknown): value is MemoryMetric {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.memory === 'number' &&
    Number.isFinite(candidate.memory) &&
    typeof candidate.timestamp === 'string'
  );
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export default function MemoryChartWidget({ externalData }: Props) {
  const { history } = useMetrics();
  const source = externalData ?? history;
  const data = useMemo(
    () =>
      source
        .filter(isMemoryMetric)
        .map((metric) => ({
          memory: clampPercent(metric.memory),
          timestamp: metric.timestamp,
        }))
        .slice(-30),
    [source]
  );

  if (data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
        Waiting for data...
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--warning)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--warning)" stopOpacity={0} />
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
            itemStyle={{ color: 'var(--warning)' }}
            labelStyle={{ display: 'none' }}
          />
          <Area
            type="monotone"
            dataKey="memory"
            stroke="var(--warning)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#memGrad)"
            isAnimationActive={false}
            name="Memory"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
