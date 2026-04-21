'use client';
 
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatBytes } from '@/lib/utils';
import type { DockerSnapshot } from '../../types';
 
interface ResourceChartsProps {
  snapshot: DockerSnapshot | null;
  topContainers: {
    id: string;
    name: string;
    cpuPercent: number;
    memoryPercent: number;
  }[];
}
 
const chartColors = [
  'var(--primary)',
  'var(--accent)',
  'var(--success)',
  'var(--warning)',
  'var(--destructive)',
];

function tooltipPercent(value: string | number | readonly (string | number)[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return [`${Number(rawValue || 0).toFixed(1)}%`, 'Usage'];
}

function tooltipBytes(value: string | number | readonly (string | number)[] | undefined) {
  const val = Array.isArray(value) ? value[0] : value;
  return formatBytes(typeof val === 'number' ? val : Number(val) || 0);
}
 
export function ResourceCharts({ snapshot, topContainers }: ResourceChartsProps) {
  const diskChart = snapshot
    ? [
        { name: 'Images', value: snapshot.diskUsage.imagesBytes },
        { name: 'Containers', value: snapshot.diskUsage.containersBytes },
        { name: 'Volumes', value: snapshot.diskUsage.volumesBytes },
        { name: 'Build Cache', value: snapshot.diskUsage.buildCacheBytes },
      ]
    : [];
 
  return (
    <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Card className="border-border/60 bg-card/50 backdrop-blur-md shadow-sm overflow-hidden" data-testid="docker-resource-chart">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-semibold tracking-tight">Container resource usage</CardTitle>
              <p className="text-sm text-muted-foreground">
                CPU and memory percentages for the busiest containers.
              </p>
            </div>
            <Badge variant="outline" className="bg-background/40">Top 5</Badge>
          </div>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topContainers}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} opacity={0.4} />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                formatter={tooltipPercent}
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  backdropFilter: 'blur(8px)',
                }}
              />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
              <Bar
                dataKey="cpuPercent"
                stackId="usage"
                fill="var(--primary)"
                radius={[6, 6, 0, 0]}
                name="CPU %"
                animationDuration={1500}
              />
              <Bar
                dataKey="memoryPercent"
                stackId="usage"
                fill="var(--accent)"
                radius={[6, 6, 0, 0]}
                name="Memory %"
                animationDuration={1500}
                animationBegin={300}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
 
      <Card className="border-border/60 bg-card/50 backdrop-blur-md shadow-sm overflow-hidden" data-testid="docker-disk-chart">
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">Docker disk usage</CardTitle>
          <p className="text-sm text-muted-foreground">
            Images, containers, volumes, and build cache footprint.
          </p>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={diskChart}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={4}
                animationDuration={1200}
              >
                {diskChart.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={chartColors[index % chartColors.length]}
                    stroke="none"
                  />
                ))}
              </Pie>
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
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </section>
  );
}
