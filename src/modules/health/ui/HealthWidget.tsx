'use client';

import React, { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive } from 'lucide-react';
import type { SystemMetric } from '@/lib/MetricsContext';
import { motion } from 'framer-motion';

interface HealthData {
  cpu: number;
  memory: number;
  disk: number;
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-secondary/30 backdrop-blur-xs rounded-full overflow-hidden border border-white/5">
      <motion.div
        className={`h-full rounded-full ${color} relative`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value, 100)}%` }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="absolute inset-0 bg-white/20"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
        />
      </motion.div>
    </div>
  );
}

function toHealthData(metric?: Pick<SystemMetric, 'cpu' | 'memory' | 'disks'> | null): HealthData {
  return {
    cpu: metric?.cpu ?? 0,
    memory: metric?.memory ?? 0,
    disk: metric?.disks?.[0]?.use ?? 0,
  };
}

interface HealthWidgetProps {
  metric?: Pick<SystemMetric, 'cpu' | 'memory' | 'disks'> | null;
}

export default function HealthWidget({ metric }: HealthWidgetProps) {
  const [internalHealth, setInternalHealth] = useState<HealthData>(() => toHealthData(metric));
  const [hasStreamData, setHasStreamData] = useState<boolean>(Boolean(metric));

  const [prevMetric, setPrevMetric] = useState(metric);
  if (metric !== prevMetric) {
    setPrevMetric(metric);
    if (metric) {
      setHasStreamData(true);
      setInternalHealth(toHealthData(metric));
    } else {
      setHasStreamData(false);
    }
  }

  useEffect(() => {
    if (metric) return;

    const es = new EventSource('/api/metrics/stream');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setHasStreamData(true);
        setInternalHealth((prev) => ({
          cpu: data.cpu ?? prev.cpu,
          memory: data.memory ?? prev.memory,
          disk: data.disks?.[0]?.use ?? prev.disk,
        }));
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [metric]);

  // Use prop if available, otherwise use stream data
  const health = metric ? toHealthData(metric) : internalHealth;

  const labelClass = hasStreamData ? 'text-muted-foreground' : 'text-muted-foreground/70';

  const items = [
    { label: 'CPU', value: health.cpu, icon: Cpu, color: 'bg-primary' },
    { label: 'Memory', value: health.memory, icon: MemoryStick, color: 'bg-warning' },
    { label: 'Disk', value: health.disk, icon: HardDrive, color: 'bg-success' },
  ];

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <motion.div
          key={item.label}
          className="group relative space-y-2 rounded-xl border border-transparent bg-card/35 px-2 py-2 transition-colors duration-200 hover:border-border/60 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-14"
          role="group"
          tabIndex={0}
          layout
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            delay: index * 0.1,
            duration: 0.4,
            layout: { type: 'spring', stiffness: 260, damping: 20 },
          }}
          whileHover={{ x: 2, scale: 1.004 }}
          whileTap={{ scale: 0.996 }}
        >
          <span
            className="pointer-events-none absolute left-0 top-0 h-full w-0.5 rounded-l-xl bg-primary/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors duration-300">
              <item.icon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium tracking-tight">{item.label}</span>
            </div>
            <motion.span
              className={`text-xs font-semibold tabular-nums ${labelClass}`}
              key={item.value}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
            >
              {hasStreamData ? `${item.value.toFixed(1)}%` : '—'}
            </motion.span>
          </div>
          <ProgressBar value={hasStreamData ? item.value : 0} color={item.color} />
        </motion.div>
      ))}
    </div>
  );
}
