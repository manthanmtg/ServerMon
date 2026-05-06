'use client';

import React from 'react';
import { Cpu, MemoryStick, Clock, Activity as ActivityIcon } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import ProShell from '@/components/layout/ProShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton, SkeletonChart, SkeletonTable } from '@/components/ui/skeleton';
import { renderWidget } from '@/components/modules/ModuleWidgetRegistry';
import { MetricsProvider, useMetrics } from '@/lib/MetricsContext';

const MotionCard = motion.create(Card);

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 15, opacity: 0 },
  show: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24,
    },
  },
};

function StatCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 sm:p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-4 w-4 rounded" variant="circular" />
        </div>
        <Skeleton className="h-7 w-16" />
        <div className="mt-2 h-8 w-full">
          <Skeleton className="h-full w-full rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
        <div className="col-span-2 lg:col-span-1">
          <StatCardSkeleton />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="lg:col-span-2">
          <SkeletonChart />
        </div>
        <SkeletonChart />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="lg:col-span-2">
          <SkeletonTable rows={4} />
        </div>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}

const Sparkline = React.memo(function Sparkline({
  data,
  color = 'var(--primary)',
}: {
  data: number[];
  color?: string;
}) {
  const gradientId = React.useId();
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 30;

  // Normalize points to SVG coordinate space
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return { x, y };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const areaPathData = `${pathData} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-8 opacity-60 overflow-visible translate-y-1"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5, delay: 0.2 }}
        fill={`url(#${gradientId})`}
        d={areaPathData}
        stroke="none"
      />
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d={pathData}
      />
    </svg>
  );
});

// Helper to format bytes to GB
const formatGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(1);

// Helper to format uptime (seconds) to a readable string
const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / (24 * 3600));
  const hrs = Math.floor((seconds % (24 * 3600)) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m ${Math.floor(seconds % 60)}s`;
};

function DashboardContent() {
  const { latest, history, connected } = useMetrics();
  const [pingLatency, setPingLatency] = React.useState<number | null>(null);
  const [pingHistory, setPingHistory] = React.useState<number[]>([]);

  // Calculate approximate data latency
  const dataLatency = latest
    ? Math.max(0, new Date().getTime() - new Date(latest.serverTimestamp).getTime())
    : 0;

  // Ping logic (every 10s)
  React.useEffect(() => {
    const performPing = async () => {
      const start = Date.now();
      try {
        await fetch('/api/health/ping');
        const end = Date.now();
        const diff = end - start;
        setPingLatency(diff);
        setPingHistory((prev) => [...prev, diff].slice(-20));
      } catch {
        setPingLatency(null);
      }
    };

    performPing();
    const interval = setInterval(performPing, 10000);
    return () => clearInterval(interval);
  }, []);

  const isInitialLoad = !latest;

  const cpuHistory = React.useMemo(() => history.map((m) => m.cpu), [history]);
  const memoryHistory = React.useMemo(() => history.map((m) => m.memory), [history]);
  const latencyHistory = React.useMemo(
    () => history.map((m) => Math.max(0, (new Date(m.timestamp).getTime() % 1000) / 10)),
    [history]
  );

  if (isInitialLoad) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Stat Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4"
      >
        <motion.div variants={itemVariants}>
          <StatCard
            label="CPU"
            value={latest ? `${latest.cpu.toFixed(1)}%` : '--'}
            subLabel={latest ? `${latest.cpuCores} Cores` : ''}
            icon={<Cpu className="w-4 h-4" />}
            status={!latest ? 'loading' : latest.cpu > 80 ? 'warning' : 'normal'}
            historyData={cpuHistory}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard
            label="Memory"
            value={latest ? `${latest.memory.toFixed(1)}%` : '--'}
            subLabel={
              latest ? `${formatGB(latest.memUsed)} of ${formatGB(latest.memTotal)} GB` : ''
            }
            icon={<MemoryStick className="w-4 h-4" />}
            status={!latest ? 'loading' : latest.memory > 80 ? 'warning' : 'normal'}
            historyData={memoryHistory}
            color="var(--accent)"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard
            label="Uptime"
            value={latest ? formatUptime(latest.uptime) : '--'}
            subLabel="System Online"
            icon={<Clock className="w-4 h-4" />}
            status={!latest ? 'loading' : 'normal'}
            color="var(--success)"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard
            label="Data Latency"
            value={connected ? `${dataLatency}ms` : '--'}
            subLabel={connected ? 'Stream Lag' : 'Reconnecting...'}
            icon={<ActivityIcon className="w-4 h-4" />}
            status={!connected ? 'loading' : dataLatency > 200 ? 'warning' : 'normal'}
            historyData={latencyHistory}
            color="var(--info)"
          />
        </motion.div>
        <motion.div variants={itemVariants} className="col-span-2 lg:col-span-1">
          <StatCard
            label="Ping"
            value={pingLatency !== null ? `${pingLatency}ms` : '--'}
            subLabel="Network RTT"
            icon={<ActivityIcon className="w-4 h-4" />}
            status={pingLatency === null ? 'loading' : pingLatency > 150 ? 'warning' : 'normal'}
            historyData={pingHistory}
            color="var(--warning)"
          />
        </motion.div>
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="lg:col-span-2 shadow-sm border-border/40 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between pb-2 bg-muted/5">
            <div>
              <CardTitle className="text-base font-medium">CPU Usage</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time load across all cores
              </p>
            </div>
            <Badge variant={connected ? 'success' : 'secondary'} className="gap-1.5 py-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`}
                aria-hidden="true"
              />
              {connected ? 'Live' : 'Offline'}
            </Badge>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[200px] sm:h-[280px]">
              {renderWidget('CPUChartWidget', { externalData: history })}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/40 overflow-hidden">
          <CardHeader className="pb-2 bg-muted/5">
            <CardTitle className="text-base font-medium">Memory Usage</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Active physical memory allocation
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[200px] sm:h-[280px]">
              {renderWidget('MemoryChartWidget', { externalData: history })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>{renderWidget('LogsWidget')}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent>{renderWidget('HealthWidget', { metric: latest })}</CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProShell title="Dashboard" subtitle="Overview">
      <MetricsProvider>
        <DashboardContent />
      </MetricsProvider>
    </ProShell>
  );
}

const StatCard = React.memo(function StatCard({
  label,
  value,
  subLabel,
  icon,
  status,
  historyData = [],
  color,
}: {
  label: string;
  value: string;
  subLabel?: string;
  icon: React.ReactNode;
  status: 'normal' | 'warning' | 'loading';
  historyData?: number[];
  color?: string;
}) {
  return (
    <MotionCard
      whileHover={{
        y: -4,
        transition: { duration: 0.2, ease: 'easeOut' },
      }}
      whileTap={{ scale: 0.98 }}
      className="relative overflow-hidden group hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-lg active:shadow-inner"
    >
      <CardContent className="p-3 sm:p-4 relative z-10">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
            {label}
          </h4>
          <motion.span
            whileHover={{ scale: 1.2, rotate: 5 }}
            className={
              status === 'warning'
                ? 'text-warning'
                : 'text-muted-foreground/60 group-hover:text-primary transition-colors'
            }
          >
            {status === 'loading' ? <Spinner size="sm" /> : <div aria-hidden="true">{icon}</div>}
          </motion.span>
        </div>

        <div className="flex items-baseline gap-2 flex-wrap">
          <p
            className={`text-xl sm:text-2xl font-bold tracking-tight ${
              status === 'warning' ? 'text-warning' : 'text-foreground'
            }`}
          >
            {value}
          </p>
          {subLabel && (
            <span className="text-[10px] sm:text-xs text-muted-foreground truncate opacity-70 group-hover:opacity-100 transition-opacity">
              {subLabel}
            </span>
          )}
        </div>

        <div className="mt-2 h-8 w-full">
          <Sparkline data={historyData} color={color} />
        </div>
      </CardContent>

      {/* Subtle background glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-15 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 70% 30%, ${color || 'var(--primary)'} 0%, transparent 70%)`,
        }}
      />
    </MotionCard>
  );
});
