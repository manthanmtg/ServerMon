'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--card)_75%,transparent),color-mix(in_oklab,var(--background)_92%,black))] p-4 shadow-[0_18px_40px_-24px_color-mix(in_oklab,var(--primary)_35%,transparent)] backdrop-blur-md"
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-16 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-background/30 shadow-[0_0_18px_color-mix(in_oklab,var(--primary)_18%,transparent)]">
              <Network className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground/70">
                Active Interface
              </span>
              <span className="block truncate text-sm font-black tracking-tighter text-foreground">
                {stats?.iface || 'Network'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.04, ease: 'easeOut' }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--border)_60%,transparent),0_20px_40px_-28px_color-mix(in_oklab,var(--success)_45%,transparent)] backdrop-blur-md transition-colors hover:border-white/15"
        >
          <div className="pointer-events-none absolute inset-x-4 top-0 h-12 rounded-full bg-success/10 opacity-70 blur-2xl transition-opacity group-hover:opacity-100" />
          <div className="relative flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-success font-semibold">
              <ArrowDown className="w-3 h-3" />
              <span className="text-[10px] font-black uppercase tracking-tighter">Download</span>
            </div>
            <span className="text-sm font-bold tabular-nums truncate tracking-tighter">
              {stats ? formatBytes(stats.rx) : '0 B'}/s
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.08, ease: 'easeOut' }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--border)_60%,transparent),0_20px_40px_-28px_color-mix(in_oklab,var(--primary)_45%,transparent)] backdrop-blur-md transition-colors hover:border-white/15"
        >
          <div className="pointer-events-none absolute inset-x-4 top-0 h-12 rounded-full bg-primary/10 opacity-70 blur-2xl transition-opacity group-hover:opacity-100" />
          <div className="relative flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-primary font-semibold">
              <ArrowUp className="w-3 h-3" />
              <span className="text-[10px] font-black uppercase tracking-tighter">Upload</span>
            </div>
            <span className="text-sm font-bold tabular-nums truncate tracking-tighter">
              {stats ? formatBytes(stats.tx) : '0 B'}/s
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
