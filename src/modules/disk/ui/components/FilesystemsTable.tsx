'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes } from '@/lib/utils';
import type { SystemMetric } from '@/lib/MetricsContext';
import type { DiskSettings } from '../DiskSettingsModal';

type DiskMetric = SystemMetric['disks'][number];

interface FilesystemsTableProps {
  disks: DiskMetric[];
  settings: DiskSettings;
}

export function FilesystemsTable({ disks, settings }: FilesystemsTableProps) {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Filesystems</CardTitle>
        <p className="text-xs text-muted-foreground">Detailed mount point metrics</p>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-border/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                <th className="px-4 py-2 font-medium">Mount</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Usage</th>
                <th className="px-4 py-2 font-medium text-right">Free</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {disks.map((disk, idx) => (
                <tr key={idx} className="group hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p
                      className="text-xs font-semibold truncate max-w-[120px] md:max-w-[180px]"
                      title={disk.mount}
                    >
                      {disk.mount}
                    </p>
                    <p
                      className="text-[10px] text-muted-foreground truncate max-w-[120px] md:max-w-[180px]"
                      title={disk.fs}
                    >
                      {disk.fs}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium uppercase">
                      {disk.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 min-w-[100px]">
                    <div
                      className="h-1 w-full bg-secondary rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={disk.use}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`h-full transition-all duration-1000 ${
                          disk.use > 90
                            ? 'bg-destructive'
                            : disk.use > 75
                              ? 'bg-orange-500'
                              : 'bg-primary'
                        }`}
                        style={{ width: `${disk.use}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1 font-medium">
                      {disk.use.toFixed(1)}%
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-xs font-medium">
                      {formatBytes(disk.available, settings.unitSystem)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {(100 - disk.use).toFixed(0)}% free
                    </p>
                  </td>
                </tr>
              ))}
              {disks.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-xs text-muted-foreground italic"
                  >
                    No active filesystems detected
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
