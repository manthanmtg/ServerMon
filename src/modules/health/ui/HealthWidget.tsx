'use client';

import React, { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive } from 'lucide-react';
import type { SystemMetric } from '@/lib/MetricsContext';

interface HealthData {
  cpu: number;
  memory: number;
  disk: number;
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
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

  useEffect(() => {
    // If we have a metric provided by props, we don't need the local stream
    if (metric) return;

    const es = new EventSource('/api/metrics/stream');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
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

  const items = [
    { label: 'CPU', value: health.cpu, icon: Cpu, color: 'bg-primary' },
    { label: 'Memory', value: health.memory, icon: MemoryStick, color: 'bg-warning' },
    { label: 'Disk', value: health.disk, icon: HardDrive, color: 'bg-success' },
  ];

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <item.icon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{item.label}</span>
            </div>
            <span className="text-xs font-semibold text-foreground tabular-nums">
              {item.value.toFixed(1)}%
            </span>
          </div>
          <ProgressBar value={item.value} color={item.color} />
        </div>
      ))}
    </div>
  );
}
