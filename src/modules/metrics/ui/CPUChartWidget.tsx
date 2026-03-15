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
      const metric = JSON.parse(event.data);
      setInternalData((prev) => [...prev, metric].slice(-30));
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [externalData]);

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
