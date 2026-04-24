'use client';

import React from 'react';
import { useMetrics } from '@/lib/MetricsContext';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Brain, Database, Activity, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export default function MemoryWidget() {
  const { latest, history } = useMetrics();

  if (!latest) return null;

  const usedGb = latest.memUsed / (1024 * 1024 * 1024);
  const totalGb = latest.memTotal / (1024 * 1024 * 1024);
  const percent = latest.memory;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      layout
      className="flex flex-col h-full gap-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Physical Memory</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold opacity-70">
              RAM Status
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tracking-tighter leading-none">
            {percent.toFixed(1)}%
          </div>
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1 opacity-70">
            Usage
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <motion.div
          whileHover={{ scale: 1.01, backgroundColor: 'rgba(var(--card-rgb), 0.6)' }}
          whileTap={{ scale: 0.99 }}
          className="p-3 rounded-xl bg-card/40 backdrop-blur-md border border-white/5 shadow-sm transition-colors group"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Activity className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Used
            </span>
          </div>
          <div className="text-sm font-bold truncate tracking-tight">{usedGb.toFixed(2)} GB</div>
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.01, backgroundColor: 'rgba(var(--card-rgb), 0.6)' }}
          whileTap={{ scale: 0.99 }}
          className="p-3 rounded-xl bg-card/40 backdrop-blur-md border border-white/5 shadow-sm transition-colors group"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Database className="w-3.5 h-3.5 text-muted-foreground group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Total
            </span>
          </div>
          <div className="text-sm font-bold truncate tracking-tight">{totalGb.toFixed(2)} GB</div>
        </motion.div>
      </div>

      <div className="flex-1 min-h-[80px] relative -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history.slice(-30)}>
            <defs>
              <linearGradient id="memWidgetGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                <stop offset="50%" stopColor="var(--primary)" stopOpacity={0.1} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="memory"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#memWidgetGrad)"
              isAnimationActive={true}
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center">
            <div
              className={cn(
                'w-2 h-2 rounded-full animate-pulse z-10',
                percent > 90 ? 'bg-destructive' : percent > 70 ? 'bg-warning' : 'bg-emerald-500'
              )}
            />
            <div
              className={cn(
                'absolute inset-0 rounded-full blur-[4px] opacity-60 animate-pulse',
                percent > 90
                  ? 'bg-destructive shadow-[0_0_8px_var(--destructive)]'
                  : percent > 70
                    ? 'bg-warning shadow-[0_0_8px_var(--warning)]'
                    : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
              )}
            />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {percent > 90 ? 'Critical' : percent > 70 ? 'High' : 'Healthy'}
          </span>
        </div>
        <a
          href="/memory"
          className="text-[11px] font-bold text-primary flex items-center gap-1.5 hover:underline group px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors"
        >
          Details{' '}
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </motion.div>
  );
}
