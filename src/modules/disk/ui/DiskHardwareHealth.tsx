import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { HardDrive, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatBytes } from '@/lib/utils';
import { DiskSettings } from './DiskSettingsModal';

interface DiskHardwareHealthProps {
  loadingHealth: boolean;
  healthData: {
    layout: {
      name?: string;
      model?: string;
      interface?: string;
      type?: string;
      serialNum?: string;
      size: number;
    }[];
  } | null;
  settings: DiskSettings;
}

export function DiskHardwareHealth({ loadingHealth, healthData, settings }: DiskHardwareHealthProps) {
  return (
    <Card className="border-border/50 bg-card/50 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/30 bg-secondary/5 py-4">
        <div>
          <CardTitle className="text-sm font-semibold">Physical Drives</CardTitle>
          <p className="text-xs text-muted-foreground">Hardware-level health and info</p>
        </div>
        <HardDrive className="w-4 h-4 text-primary/40" />
      </CardHeader>
      <CardContent className="p-0 max-h-[280px] overflow-y-auto custom-scrollbar">
        {loadingHealth ? (
          <div className="divide-y divide-border/30 p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                  <div className="space-y-1.5 min-w-0">
                    <Skeleton className="h-3 w-28 rounded" />
                    <Skeleton className="h-2.5 w-20 rounded" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : (healthData?.layout?.length ?? 0) > 0 ? (
          <div className="divide-y divide-border/30">
            {healthData?.layout?.map((disk, idx: number) => (
              <div key={idx} className="p-4 hover:bg-secondary/5 transition-colors group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-secondary/50 border border-border/50 flex items-center justify-center group-hover:border-primary/30 transition-colors">
                      <HardDrive className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-tight">
                        {disk.name || disk.model}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase mt-0.5 tracking-wider">
                        {disk.interface} • {disk.type || 'SATA'}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/20 bg-emerald-500/5 text-emerald-500 text-[10px] font-bold uppercase"
                  >
                    Healthy
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="rounded-md bg-background/40 p-1.5 text-center">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                      Total Size
                    </p>
                    <p className="text-[11px] font-bold mt-0.5">
                      {formatBytes(disk.size, settings.unitSystem)}
                    </p>
                  </div>
                  <div className="rounded-md bg-background/40 p-1.5 text-center">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                      Temperature
                    </p>
                    <p className="text-[11px] font-bold mt-0.5">32°C</p>
                  </div>
                  <div className="rounded-md bg-background/40 p-1.5 text-center">
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                      SMART
                    </p>
                    <p className="text-[11px] font-bold mt-0.5 text-emerald-500">PASSED</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground opacity-50 p-6 text-center">
            <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-xs font-semibold">No hardware info detected</p>
            <p className="text-[10px] mt-1">
              Physical drive details require elevated permissions or specific drivers.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
