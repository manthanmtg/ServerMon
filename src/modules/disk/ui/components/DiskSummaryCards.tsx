'use client';

import { Activity, Database, ShieldCheck, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatBytes } from '@/lib/utils';
import type { SystemMetric } from '@/lib/MetricsContext';
import type { DiskSettings } from '../DiskSettingsModal';

type DiskMetric = SystemMetric['disks'][number];

interface DiskSummaryCardsProps {
  disks: DiskMetric[];
  healthDriveCount: number;
  primaryDisk?: DiskMetric;
  settings: DiskSettings;
  totalIORead: number;
  totalIOWrite: number;
}

export function DiskSummaryCards({
  disks,
  healthDriveCount,
  primaryDisk,
  settings,
  totalIORead,
  totalIOWrite,
}: DiskSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="border-border/50 bg-card/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Main Storage
            </p>
            <Database className="w-4 h-4 text-primary/40" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold tracking-tight">
              {primaryDisk?.use.toFixed(1) || 0}%
            </h3>
            <p className="text-xs text-muted-foreground">capacity used</p>
          </div>
          <div
            className="mt-3 h-1.5 w-full bg-secondary rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={primaryDisk?.use || 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${primaryDisk?.mount || 'Main'} storage usage`}
          >
            <div
              className={`h-full transition-all duration-1000 ${(primaryDisk?.use || 0) > 90 ? 'bg-destructive' : (primaryDisk?.use || 0) > 75 ? 'bg-orange-500' : 'bg-primary'}`}
              style={{ width: `${primaryDisk?.use || 0}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground font-medium">
            <span>
              {primaryDisk ? formatBytes(primaryDisk.used, settings.unitSystem) : '0 B'} used
            </span>
            <span>{primaryDisk ? formatBytes(primaryDisk.size, settings.unitSystem) : '0 B'}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Live Throughput
            </p>
            <Zap className="w-4 h-4 text-amber-500/40" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-4 h-4 rounded-sm bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[9px] font-black text-emerald-500"
                  aria-label="Read"
                >
                  R
                </span>
                <span className="text-xs font-semibold">
                  {formatBytes(totalIORead, settings.unitSystem)}/s
                </span>
              </div>
              <span
                className="text-[10px] text-muted-foreground uppercase font-bold"
                aria-hidden="true"
              >
                Read
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-4 h-4 rounded-sm bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[9px] font-black text-blue-500"
                  aria-label="Write"
                >
                  W
                </span>
                <span className="text-xs font-semibold">
                  {formatBytes(totalIOWrite, settings.unitSystem)}/s
                </span>
              </div>
              <span
                className="text-[10px] text-muted-foreground uppercase font-bold"
                aria-hidden="true"
              >
                Write
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border/30 pt-2">
            <span className="text-[10px] text-muted-foreground truncate">Total Activity:</span>
            <span className="min-w-0 text-xs font-mono font-bold text-primary">
              {formatBytes(totalIORead + totalIOWrite, settings.unitSystem)}/s
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Disk Health
            </p>
            <ShieldCheck className="w-4 h-4 text-emerald-500/40" aria-hidden="true" />
          </div>
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-lg font-bold">Optimal</h3>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {healthDriveCount} physical drive{healthDriveCount !== 1 ? 's' : ''} detected.
            </p>
          </div>
          <div className="mt-4 flex gap-1">
            {Array.from({ length: healthDriveCount }).map((_, index) => (
              <div key={index} className="flex-1 h-1 rounded-full bg-emerald-500/30" />
            ))}
          </div>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-tighter text-emerald-500/80">
            All SMART markers passed
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Active Load
            </p>
            <Activity className="w-4 h-4 text-indigo-500/40" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold tracking-tight">{disks.length}</h3>
            <p className="text-xs text-muted-foreground">mount points</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {disks.slice(0, 3).map((disk, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-[9px] px-1 py-0 h-4 border-muted-foreground/20 bg-muted/5 font-mono"
              >
                {disk.mount === '/' ? 'root' : disk.mount.split('/').pop()}
              </Badge>
            ))}
            {disks.length > 3 && (
              <span className="text-[9px] text-muted-foreground">+{disks.length - 3} more</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
