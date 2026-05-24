'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes } from '@/lib/utils';

const chartColors = [
  'var(--primary)',
  'var(--accent)',
  'var(--success)',
  'var(--warning)',
  'var(--destructive)',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
];

type ServicesChartCpuDatum = {
  name: string;
  cpuPercent: number;
};

type ServicesChartMemoryDatum = {
  name: string;
  memoryBytes: number;
};

type ServicesStateDistributionPoint = {
  name: string;
  value: number;
  fill: string;
};

type ServicesCpuHistoryPoint = {
  time: string;
  [key: string]: number | string;
};

export type ServicesChartsPanelProps = {
  topByCpu: ServicesChartCpuDatum[];
  topByMemory: ServicesChartMemoryDatum[];
  stateDistribution: ServicesStateDistributionPoint[];
  cpuHistory: ServicesCpuHistoryPoint[];
};

export function ServicesChartsPanel({
  topByCpu,
  topByMemory,
  stateDistribution,
  cpuHistory,
}: ServicesChartsPanelProps) {
  return (
    <>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Top services by CPU</CardTitle>
                <p className="text-sm text-muted-foreground">Horizontal bar chart of the busiest services.</p>
              </div>
              <Badge variant="outline">Top 10</Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topByCpu} layout="vertical">
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: unknown) => [
                    `${(typeof value === 'number' ? value : Number(value || 0)).toFixed(2)}%`,
                    'CPU',
                  ]}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Bar
                  dataKey="cpuPercent"
                  fill="var(--primary)"
                  radius={[0, 6, 6, 0]}
                  name="CPU %"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Top services by memory</CardTitle>
                <p className="text-sm text-muted-foreground">Memory consumption of the heaviest services.</p>
              </div>
              <Badge variant="outline">Top 10</Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topByMemory} layout="vertical">
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  tickFormatter={(value: number) => formatBytes(value)}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: unknown) => [
                    formatBytes(typeof value === 'number' ? value : Number(value || 0)),
                    'Memory',
                  ]}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Bar
                  dataKey="memoryBytes"
                  fill="var(--accent)"
                  radius={[0, 6, 6, 0]}
                  name="Memory"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Service state distribution</CardTitle>
            <p className="text-sm text-muted-foreground">Breakdown of services by active state.</p>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stateDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {stateDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>CPU usage over time</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tracking the top 5 CPU-consuming services.
            </p>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cpuHistory}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                />
                {[0, 1, 2, 3, 4].map((i) => (
                  <Line
                    key={i}
                    type="monotone"
                    dataKey={`cpu${i}`}
                    stroke={chartColors[i]}
                    strokeWidth={2}
                    dot={false}
                    name={
                      (cpuHistory[cpuHistory.length - 1]?.[`name${i}`] as string) ||
                      `Service ${i + 1}`
                    }
                  />
                ))}
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
