'use client';

import React, { useState, useEffect } from 'react';
import ProShell from '@/components/layout/ProShell';
import { useMetrics } from '@/lib/MetricsContext';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, Zap, Database, Trash2, Brain, RefreshCcw, List, Terminal } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MemoryStats {
  total: number;
  free: number;
  used: number;
  active: number;
  available: number;
  buffers: number;
  cached: number;
  slab: number;
  swaptotal: number;
  swapused: number;
  swapfree: number;
}

interface MemoryProcess {
  pid: number;
  name: string;
  user: string;
  mem: number;
  memRss: number;
  memVsz: number;
}

export default function MemoryPage() {
  const { latest, history } = useMetrics();
  const { toast } = useToast();
  const [detailedStats, setDetailedStats] = useState<MemoryStats | null>(null);
  const [topProcs, setTopProcs] = useState<MemoryProcess[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [statsRes, procsRes] = await Promise.all([
        fetch('/api/modules/memory/stats'),
        fetch('/api/modules/memory/processes?limit=15'),
      ]);

      if (statsRes.ok) setDetailedStats(await statsRes.json());
      if (procsRes.ok) setTopProcs(await procsRes.json());
    } catch (_err: unknown) {
      console.error('Failed to fetch memory data');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleKillProcess = async (pid: number) => {
    try {
      const res = await fetch(`/api/modules/processes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, signal: 'SIGTERM' }),
      });

      if (res.ok) {
        toast({ title: 'Success', description: `Process ${pid} terminated`, variant: 'success' });
        fetchData();
      } else {
        throw new Error('Failed to kill process');
      }
    } catch (_err: unknown) {
      toast({ title: 'Error', description: 'Failed to terminate process', variant: 'destructive' });
    }
  };

  const isHighPressure = latest ? latest.memory > 85 : false;

  return (
    <ProShell title="Memory" subtitle="Resource Diagnostics">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Status Bar */}
        <div className="flex flex-col md:flex-row gap-4">
          <motion.div
            whileHover={{ scale: 1.01 }}
            className={cn(
              'flex-1 p-4 rounded-2xl border flex items-center gap-4 transition-all',
              isHighPressure
                ? 'bg-destructive/5 border-destructive/20 text-destructive shadow-sm shadow-destructive/10'
                : 'bg-card border-border shadow-sm'
            )}
          >
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center',
                isHighPressure ? 'bg-destructive/10' : 'bg-primary/10'
              )}
            >
              <Activity
                className={cn('w-6 h-6', isHighPressure ? 'text-destructive' : 'text-primary')}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold truncate">Current Pressure</h2>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                {isHighPressure ? 'Critical System Load' : 'System Healthy'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black tracking-tighter">
                {latest ? latest.memory.toFixed(1) : '--'}%
              </div>
            </div>
          </motion.div>

          <div className="flex-[2] grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Total RAM',
                value: latest ? formatBytes(latest.memTotal) : '--',
                icon: Database,
              },
              { label: 'Used RAM', value: latest ? formatBytes(latest.memUsed) : '--', icon: Zap },
              {
                label: 'Total Swap',
                value: detailedStats ? formatBytes(detailedStats.swaptotal) : '--',
                icon: Terminal,
              },
              {
                label: 'Used Swap',
                value: detailedStats ? formatBytes(detailedStats.swapused) : '--',
                icon: Brain,
              },
            ].map((stat, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -2 }}
                className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between"
              >
                <stat.icon className="w-4 h-4 text-muted-foreground mb-3" />
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
                    {stat.label}
                  </p>
                  <div className="text-sm font-bold truncate">{stat.value}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Charts Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-3xl bg-card border border-border shadow-md">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-bold tracking-tight">RAM Historical</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  Real-time telemetry stream
                </p>
              </div>
              <div className="p-2 rounded-xl bg-accent/50 text-accent-foreground">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="h-[280px] -mx-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="memGradMain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border)"
                    opacity={0.3}
                  />
                  <XAxis dataKey="timestamp" hide={true} />
                  <YAxis
                    domain={[0, 100]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    unit="%"
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      fontSize: '12px',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    }}
                    itemStyle={{ color: 'var(--primary)', fontWeight: 'bold' }}
                    labelStyle={{ color: 'var(--muted-foreground)', marginBottom: '4px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="memory"
                    stroke="var(--primary)"
                    strokeWidth={3}
                    fill="url(#memGradMain)"
                    isAnimationActive={true}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-card border border-border shadow-md">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold tracking-tight">Memory Breakdown</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  Internal allocation analysis
                </p>
              </div>
              <button
                onClick={fetchData}
                disabled={isRefreshing}
                className="p-2.5 rounded-xl bg-primary/5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                <RefreshCcw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
              </button>
            </div>

            <div className="space-y-4">
              {[
                {
                  label: 'Active',
                  value: detailedStats?.active,
                  total: detailedStats?.total,
                  color: 'bg-primary',
                },
                {
                  label: 'Cached',
                  value: detailedStats?.cached,
                  total: detailedStats?.total,
                  color: 'bg-emerald-500',
                },
                {
                  label: 'Buffers',
                  value: detailedStats?.buffers,
                  total: detailedStats?.total,
                  color: 'bg-amber-500',
                },
                {
                  label: 'Slab',
                  value: detailedStats?.slab,
                  total: detailedStats?.total,
                  color: 'bg-indigo-500',
                },
              ].map((item, i) => {
                const ratio = ((item.value || 0) / (item.total || 1)) * 100;
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>{item.label}</span>
                      <span className="text-foreground">{formatBytes(item.value || 0)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-accent/30 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${ratio}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className={cn('h-full', item.color)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 pt-6 border-t border-border/50">
              <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                Swap Utilization
              </h4>
              {detailedStats && detailedStats.swaptotal > 0 ? (
                <div className="p-4 rounded-2xl bg-accent/20 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-bold tracking-tight">
                      {((detailedStats.swapused / detailedStats.swaptotal) * 100).toFixed(1)}% Used
                    </div>
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {formatBytes(detailedStats.swapused)} / {formatBytes(detailedStats.swaptotal)}
                    </div>
                  </div>
                  <div className="h-3 rounded-full bg-background overflow-hidden p-0.5 border border-border/50">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(detailedStats.swapused / detailedStats.swaptotal) * 100}%` }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className="h-full rounded-full bg-warning"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                  <div className="flex gap-3">
                    <Terminal className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-amber-600">Swap is Disabled</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Swap space is 0B. This usually means swap is disabled on this system, which
                        is common in cloud instances and containerized environments to ensure
                        predictable performance.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top Processes Table */}
        <div className="p-6 rounded-3xl bg-card border border-border shadow-md">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground">
                <List className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight">Top Memory Consumers</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  Sorted by RSS (Resident Set Size)
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="pb-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Process
                  </th>
                  <th className="pb-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="pb-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">
                    PID
                  </th>
                  <th className="pb-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center px-4">
                    Usage
                  </th>
                  <th className="pb-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">
                    RSS
                  </th>
                  <th className="pb-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">
                    VMS
                  </th>
                  <th className="pb-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                <AnimatePresence mode="popLayout">
                  {topProcs.map((proc) => (
                    <motion.tr
                      key={proc.pid}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="group hover:bg-accent/30 transition-colors"
                    >
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                            {proc.name[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold truncate max-w-[200px]">
                              {proc.name}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className="px-2 py-0.5 rounded-md bg-accent/40 text-[10px] font-mono font-bold text-muted-foreground">
                          {proc.user}
                        </span>
                      </td>
                      <td className="py-4 text-xs font-mono text-muted-foreground text-right">
                        {proc.pid}
                      </td>
                      <td className="py-4 px-4 min-w-[160px]">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] font-bold px-0.5">
                            <span className={cn(proc.mem > 5 ? 'text-primary' : 'text-emerald-500')}>
                              {proc.mem.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-accent/20 overflow-hidden border border-border/10 p-[1px]">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.max(proc.mem * 2, 2)}%` }}
                              className={cn(
                                'h-full rounded-full transition-all duration-700 min-w-[2px]',
                                proc.mem > 10 ? 'bg-primary' : 'bg-emerald-500'
                              )}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-4 text-xs font-bold text-right text-foreground">
                        {formatBytes(proc.memRss * 1024)}
                      </td>
                      <td className="py-4 text-xs text-muted-foreground text-right">
                        {formatBytes(proc.memVsz * 1024)}
                      </td>
                      <td className="py-4 text-right">
                        <button
                          onClick={() => handleKillProcess(proc.pid)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                          title="Terminate Process"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
                {topProcs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      Scanning system for memory consumers...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </ProShell>
  );
}
