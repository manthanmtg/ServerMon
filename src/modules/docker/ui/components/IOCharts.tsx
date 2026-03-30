'use client';
 
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes } from '@/lib/utils';
import type { DockerSnapshot, DockerContainerSummary } from '../../types';
 
interface IOChartsProps {
  snapshot: DockerSnapshot | null;
  selectedContainer: DockerContainerSummary | null;
  ioHistory: any[];
  networkHistory: any[];
  onContainerChange: (id: string) => void;
}
 
const chartColors = [
  'var(--primary)',
  'var(--accent)',
  'var(--success)',
  'var(--warning)',
  'var(--destructive)',
];
 
function tooltipBytes(value: string | number | readonly (string | number)[] | undefined) {
  const val = Array.isArray(value) ? value[0] : value;
  return formatBytes(typeof val === 'number' ? val : Number(val) || 0);
}
 
export function IOCharts({
  snapshot,
  selectedContainer,
  ioHistory,
  networkHistory,
  onContainerChange,
}: IOChartsProps) {
  return (
    <section className="grid gap-6 2xl:grid-cols-2">
      <Card className="border-border/60 bg-card/50 backdrop-blur-md shadow-sm overflow-hidden" data-testid="docker-io-chart">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold tracking-tight">Container I/O</CardTitle>
              <p className="text-sm text-muted-foreground">
                Read and write activity for the selected container.
              </p>
            </div>
            <select
              value={selectedContainer?.id || ''}
              onChange={(event) => onContainerChange(event.target.value)}
              className="min-h-[40px] rounded-xl border border-border/40 bg-background/50 px-3 text-sm font-medium outline-none transition-shadow focus:ring-1 focus:ring-primary/40 backdrop-blur-sm"
            >
              {snapshot?.containers.map((container) => (
                <option key={container.id} value={container.id}>
                  {container.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ioHistory}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} opacity={0.4} />
              <XAxis
                dataKey="timestamp"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                minTickGap={30}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickFormatter={(value) => formatBytes(value)}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={tooltipBytes}
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  backdropFilter: 'blur(8px)',
                }}
              />
              <Legend iconType="circle" />
              <Line
                type="monotone"
                dataKey="read"
                stroke="var(--success)"
                dot={false}
                strokeWidth={2.5}
                name="Read/s"
                animationDuration={1000}
              />
              <Line
                type="monotone"
                dataKey="write"
                stroke="var(--warning)"
                dot={false}
                strokeWidth={2.5}
                name="Write/s"
                animationDuration={1000}
                animationBegin={200}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
 
      <Card className="border-border/60 bg-card/50 backdrop-blur-md shadow-sm overflow-hidden" data-testid="docker-network-chart">
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">Network I/O by container</CardTitle>
          <p className="text-sm text-muted-foreground">
            Top traffic containers across the recent polling window.
          </p>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={networkHistory}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} opacity={0.4} />
              <XAxis
                dataKey="timestamp"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                minTickGap={25}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickFormatter={(value) => formatBytes(value)}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={tooltipBytes}
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  backdropFilter: 'blur(8px)',
                }}
              />
              <Legend iconType="circle" />
              {[0, 1, 2, 3].map((index) => (
                <Area
                  key={index}
                  type="monotone"
                  dataKey={`c${index}`}
                  stackId="1"
                  stroke={chartColors[index]}
                  fill={chartColors[index]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  name={String(
                    networkHistory.at(-1)?.[`n${index}`] || `Container ${index + 1}`
                  )}
                  animationDuration={1200}
                  animationBegin={index * 100}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </section>
  );
}
