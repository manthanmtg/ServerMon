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
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/50 border border-border min-w-0">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold text-foreground tabular-nums">{value}</p>
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
