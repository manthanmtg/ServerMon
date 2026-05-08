'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes } from '@/lib/utils';
import type { SystemMetric } from '@/lib/MetricsContext';
import type { DiskSettings } from '../DiskSettingsModal';

interface FilesystemsTableProps {
  disks: SystemMetric['disks'];
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
          <table className="min-w-[420px] w-full text-left">
            <thead className="border-b border-border/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                <th className="px-4 py-2 font-medium">Mount</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium text-right">Free</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {disks.map((disk, idx) => (
                <tr key={idx} className="group hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold truncate max-w-[100px]">{disk.mount}</p>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                      {disk.fs}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium uppercase">
                      {disk.type}
                    </span>
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
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
