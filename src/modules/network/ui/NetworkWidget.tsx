'use client';

import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Network } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import type { NetworkSnapshot } from '../types';

export default function NetworkWidget() {
  const [stats, setStats] = useState<{ rx: number; tx: number; iface: string } | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/modules/network');
        const data: NetworkSnapshot = await res.json();
        if (data.stats.length > 0) {
          // Show stats for the first non-internal interface or first one
          const primary = data.stats.find((s) => !s.iface.includes('lo')) || data.stats[0];
          setStats({ rx: primary.rx_sec, tx: primary.tx_sec, iface: primary.iface });
        }
      } catch {
        /* ignore */
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground font-medium">
          <Network className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-wider">{stats?.iface || 'Network'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-success font-semibold">
            <ArrowDown className="w-3 h-3" />
            <span className="text-[10px] uppercase">Download</span>
          </div>
          <span className="text-sm font-bold tabular-nums truncate">
            {stats ? formatBytes(stats.rx) : '0 B'}/s
          </span>
        </div>

        <div className="p-3 rounded-xl bg-accent/5 border border-accent/10 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-primary font-semibold">
            <ArrowUp className="w-3 h-3" />
            <span className="text-[10px] uppercase">Upload</span>
          </div>
          <span className="text-sm font-bold tabular-nums truncate">
            {stats ? formatBytes(stats.tx) : '0 B'}/s
          </span>
        </div>
      </div>
    </div>
  );
}
