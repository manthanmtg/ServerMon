'use client';

import React from 'react';
import { useMetrics } from '@/lib/MetricsContext';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Brain, Database, Activity, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MemoryWidget() {
  const { latest, history } = useMetrics();

  if (!latest) return null;

  const usedGb = latest.memUsed / (1024 * 1024 * 1024);
  const totalGb = latest.memTotal / (1024 * 1024 * 1024);
  const percent = latest.memory;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Physical Memory</h3>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              RAM Status
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-tight">{percent.toFixed(1)}%</div>
          <p className="text-[11px] text-muted-foreground font-medium">Usage Level</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase">Used</span>
          </div>
          <div className="text-sm font-bold truncate">{usedGb.toFixed(2)} GB</div>
        </div>
        <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase">Total</span>
          </div>
          <div className="text-sm font-bold truncate">{totalGb.toFixed(2)} GB</div>
        </div>
      </div>

      <div className="flex-1 min-h-[80px] relative -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history.slice(-20)}>
            <defs>
              <linearGradient id="memWidgetGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="memory"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#memWidgetGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full animate-pulse',
              percent > 90 ? 'bg-destructive' : percent > 70 ? 'bg-warning' : 'bg-emerald-500'
            )}
          />
          <span className="text-[11px] font-medium text-muted-foreground">
            {percent > 90 ? 'Critical Pressure' : percent > 70 ? 'High Usage' : 'System Healthy'}
          </span>
        </div>
        <a
          href="/memory"
          className="text-[11px] font-bold text-primary flex items-center gap-1 hover:underline group"
        >
          View Specs{' '}
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
    </div>
  );
}
