'use client';

import React, { useEffect, useState } from 'react';
import { useMetrics } from '@/lib/MetricsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HardDrive } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { resilientFetch } from '@/lib/fetch-utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger('disk:widget');

export default function DiskWidget() {
  const { latest } = useMetrics();
  const [unitSystem, setUnitSystem] = useState<'binary' | 'decimal'>('binary');

  useEffect(() => {
    resilientFetch('/api/modules/disk/settings', { timeout: 5000, retries: 1 })
      .then((res) => res.json())
      .then((data) => {
        if (data.settings?.unitSystem) setUnitSystem(data.settings.unitSystem);
      })
      .catch((err) => logger.error('Failed to load disk settings', err));
  }, []);

  if (!latest || !latest.disks || latest.disks.length === 0) {
    return (
      <Card className="h-full border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Disk Usage
          </CardTitle>
          <HardDrive className="w-4 h-4 text-muted-foreground/50" />
        </CardHeader>
        <CardContent className="h-[140px] flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No data available</span>
        </CardContent>
      </Card>
    );
  }

  // Show primary disk (usually /System/Volumes/Data on macOS, or /)
  const primaryDisk =
    (latest.disks || []).find((d) => d.mount === '/System/Volumes/Data') ||
    (latest.disks || []).find((d) => d.mount === '/') ||
    latest.disks?.[0];
  const io = latest.io;

  const diskLabel =
    primaryDisk.mount === '/System/Volumes/Data'
      ? 'Main Disk'
      : primaryDisk.mount === '/'
        ? 'System Usage'
        : 'Disk Usage';

  return (
    <Card className="h-full border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/20 transition-colors group">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
          {diskLabel}
        </CardTitle>
        <HardDrive className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary/50 transition-colors" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-2xl font-bold tracking-tight">{primaryDisk.use.toFixed(1)}%</span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {formatBytes(primaryDisk.used, unitSystem)} /{' '}
              {formatBytes(primaryDisk.size, unitSystem)}
            </span>
          </div>
          <div className="h-2 w-full bg-secondary/70 rounded-full overflow-hidden ring-1 ring-border/60">
            <div
              className={`h-full transition-all duration-500 rounded-full ${primaryDisk.use > 90 ? 'bg-destructive' : primaryDisk.use > 75 ? 'bg-warning' : 'bg-primary'}`}
              style={{ width: `${primaryDisk.use}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-1">
          <div className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-sm bg-success/10 border border-success/20 flex items-center justify-center text-[8px] font-black text-success">
                R
              </span>{' '}
              Read
            </span>
            <p className="text-sm font-semibold truncate">
              {io ? formatBytes(io.r_sec, unitSystem) : '0 B'}/s
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center text-[8px] font-black text-primary">
                W
              </span>{' '}
              Write
            </span>
            <p className="text-sm font-semibold truncate">
              {io ? formatBytes(io.w_sec, unitSystem) : '0 B'}/s
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
