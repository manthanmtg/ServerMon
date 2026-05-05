import React from 'react';
import { Activity, Cpu, MemoryStick } from 'lucide-react';
import type { ProcessSummary } from '../types';

function StatBoxBase({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/50 border border-border min-w-0 transition-all duration-300 hover:border-primary/20 hover:bg-secondary/80 hover:shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--primary)_15%,transparent)] cursor-default">
      <span className="text-muted-foreground shrink-0 transition-colors duration-300 group-hover:text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate transition-colors duration-300 group-hover:text-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground tabular-nums transition-transform duration-300 group-hover:scale-105 origin-left">{value}</p>
      </div>
    </div>
  );
}

const StatBox = React.memo(StatBoxBase);

export function ProcessSummaryGrid({ summary }: { summary: ProcessSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <StatBox
        label="Total"
        value={String(summary.total)}
        icon={<Activity className="w-4 h-4" />}
      />
      <StatBox label="Running" value={String(summary.running)} icon={<Cpu className="w-4 h-4" />} />
      <StatBox
        label="CPU Load"
        value={`${summary.cpuLoad.toFixed(1)}%`}
        icon={<Cpu className="w-4 h-4" />}
      />
      <StatBox
        label="Memory"
        value={`${summary.memPercent.toFixed(1)}%`}
        icon={<MemoryStick className="w-4 h-4" />}
      />
    </div>
  );
}
