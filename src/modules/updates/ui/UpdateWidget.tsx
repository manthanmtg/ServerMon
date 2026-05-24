'use client';

import React, { useEffect, useState } from 'react';
import { Package, ShieldAlert, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { resilientFetch, safeJson } from '@/lib/fetch-utils';
import type { UpdateSnapshot } from '../types';

export default function UpdateWidget() {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null);

  useEffect(() => {
    let active = true;

    const fetchUpdates = async () => {
      try {
        const res = await resilientFetch('/api/modules/updates', {
          timeout: 8000,
          retries: 1,
          retryOnStatuses: [502, 503, 504],
        });
        const data = parseUpdateSnapshot(await safeJson<unknown>(res));
        if (!active || !data || !res.ok) {
          setSnapshot(null);
          return;
        }
        setSnapshot(data);
      } catch {
        /* ignore */
        if (active) setSnapshot(null);
      }
    };

    fetchUpdates();
    const interval = setInterval(fetchUpdates, 3600000); // Check every hour
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!snapshot) return null;

  const total = snapshot.counts.security + snapshot.counts.regular + snapshot.counts.language;
  if (total === 0 && !snapshot.pendingRestart) {
    return (
      <div className="flex flex-col items-center justify-center py-6 bg-success/5 border border-success/10 rounded-2xl animate-in fade-in duration-500">
        <div className="p-3 bg-success/10 rounded-full mb-3">
          <Package className="w-6 h-6 text-success opacity-80" />
        </div>
        <span className="text-sm font-bold text-success tracking-tight">System Secure</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Package className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-[10px] uppercase font-black tracking-widest opacity-70">
            Updates
          </span>
        </div>
        {total > 0 && (
          <Badge className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary text-primary-foreground shadow-sm animate-pulse">
            {total}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {snapshot.counts.security > 0 && (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-destructive/5 border border-destructive/10 group hover:bg-destructive/10 transition-all cursor-default">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-destructive group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-foreground">Security</span>
            </div>
            <span className="text-xs font-black text-destructive tabular-nums">
              {snapshot.counts.security}
            </span>
          </div>
        )}

        {snapshot.pendingRestart && (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-warning/5 border border-warning/10 border-dashed animate-pulse">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-warning" />
              <span className="text-xs font-bold text-foreground">Reboot</span>
            </div>
            <div className="h-2 w-2 rounded-full bg-warning shadow-[0_0_8px_rgba(var(--warning),0.5)]" />
          </div>
        )}

        {snapshot.counts.regular > 0 && (total > 0 || snapshot.counts.security > 0) && (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/5 border border-primary/10 group hover:bg-primary/10 transition-all cursor-default">
            <div className="flex items-center gap-2.5">
              <Package className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-foreground">Packages</span>
            </div>
            <span className="text-xs font-black text-primary tabular-nums">
              {snapshot.counts.regular}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function parseUpdateSnapshot(value: unknown): UpdateSnapshot | null {
  if (!value || typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isUpdateCounts(record.counts)) return null;
  if (typeof record.pendingRestart !== 'boolean') return null;

  return value as UpdateSnapshot;
}

function isUpdateCounts(value: unknown): value is UpdateSnapshot['counts'] {
  if (!value || typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.security === 'number' &&
    typeof record.regular === 'number' &&
    typeof record.optional === 'number' &&
    typeof record.language === 'number'
  );
}
