import { Activity, Globe, Network, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes } from '@/lib/utils';
import type { NetworkSnapshot } from '../../types';

export function QuickInsights({ snapshot }: { snapshot: NetworkSnapshot | null }) {
  const metrics = [
    {
      label: 'Avg Throughput',
      icon: Activity,
      value: `${formatBytes((snapshot?.stats || []).reduce((acc, stat) => acc + stat.rx_sec + stat.tx_sec, 0))}/s`,
      tone: 'primary',
    },
    {
      label: 'Interfaces',
      icon: Network,
      value: `${snapshot?.interfaces.length || 0}`,
      tone: 'success',
    },
    {
      label: 'Total Connections',
      icon: Globe,
      value: `${snapshot?.connections.length || 0}`,
      tone: 'accent',
    },
    {
      label: 'Errors/Drops',
      icon: Shield,
      value: `${(snapshot?.stats || []).reduce(
        (acc, stat) => acc + stat.rx_errors + stat.tx_errors + stat.rx_dropped + stat.tx_dropped,
        0
      )}`,
      tone: 'destructive',
    },
  ];

  const toneClasses: Record<string, { icon: string; glow: string; hover: string }> = {
    primary: {
      icon: 'text-primary',
      glow: 'bg-primary/12',
      hover: 'hover:border-primary/45 hover:bg-muted/50',
    },
    success: {
      icon: 'text-success',
      glow: 'bg-success/12',
      hover: 'hover:border-success/45 hover:bg-muted/50',
    },
    accent: {
      icon: 'text-accent',
      glow: 'bg-accent/12',
      hover: 'hover:border-accent/45 hover:bg-muted/50',
    },
    destructive: {
      icon: 'text-destructive',
      glow: 'bg-destructive/12',
      hover: 'hover:border-destructive/45 hover:bg-muted/50',
    },
  };

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>Quick Insights</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        {metrics.map((metric, index) => {
          const Tone = toneClasses[metric.tone];
          const Icon = metric.icon;

          return (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04 }}
              whileHover={{ y: -2 }}
              className={`group relative overflow-hidden rounded-2xl border border-border/40 bg-muted/30 p-4 transition-all duration-200 ${Tone.hover}`}
            >
              <div className={`pointer-events-none absolute inset-x-3 -top-4 h-12 rounded-full blur-2xl opacity-0 ${Tone.glow} transition-opacity group-hover:opacity-100`} />
              <Icon className={`relative h-5 w-5 ${Tone.icon} mb-2`} />
              <p className="relative text-xs text-muted-foreground font-medium uppercase tracking-wider">
                {metric.label}
              </p>
              <p className="relative text-xl font-bold mt-1 tabular-nums tracking-tight" aria-live="polite">
                {metric.value}
              </p>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
