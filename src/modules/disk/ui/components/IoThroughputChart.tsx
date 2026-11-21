import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatBytes } from '@/lib/utils';
import { DiskSettings } from '../DiskSettingsModal';

interface IoThroughputChartProps {
  ioData: {
    timestamp: string;
    read: number;
    write: number;
  }[];
  settings: DiskSettings;
}

export const IoThroughputChart = React.memo(function IoThroughputChart({
  ioData,
  settings,
}: IoThroughputChartProps) {
  return (
    <Card className="lg:col-span-2 border-border/50 bg-card/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold">I/O Performance History</CardTitle>
          <p className="text-xs text-muted-foreground">Real-time throughput trends</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium text-muted-foreground">Read</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-[10px] font-medium text-muted-foreground">Write</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={ioData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="readGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="writeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
              tickFormatter={(v: number) => formatBytes(v, settings.unitSystem).split(' ')[0]}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(v: unknown) => formatBytes(Number(v), settings.unitSystem)}
            />
            <Area
              type="monotone"
              dataKey="read"
              stroke="#10b981"
              fill="url(#readGrad)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="write"
              stroke="#3b82f6"
              fill="url(#writeGrad)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});
