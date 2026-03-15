'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, LoaderCircle, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SecuritySnapshot } from '../types';

function ScoreGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--destructive)';
  return (
    <div className="relative w-14 h-14">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold">{score}</span>
      </div>
    </div>
  );
}

export default function SecurityWidget() {
  const [snapshot, setSnapshot] = useState<SecuritySnapshot | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/security', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      }
    } catch {
      // silently ignore for widget
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (initialLoad && !snapshot) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex items-center justify-center py-12">
          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const s = snapshot?.summary;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Security
          </CardTitle>
          <Badge
            variant={snapshot?.source === 'live' ? 'success' : 'warning'}
            className="text-[10px]"
          >
            {snapshot?.source || 'unknown'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <ScoreGauge score={snapshot?.score ?? 0} />
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-success" />
              <span className="text-muted-foreground">Passed</span>
              <span className="ml-auto font-semibold">{s?.passed ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3 h-3 text-destructive" />
              <span className="text-muted-foreground">Failed</span>
              <span
                className={cn('ml-auto font-semibold', (s?.failed ?? 0) > 0 && 'text-destructive')}
              >
                {s?.failed ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-warning" />
              <span className="text-muted-foreground">Warnings</span>
              <span
                className={cn('ml-auto font-semibold', (s?.warnings ?? 0) > 0 && 'text-warning')}
              >
                {s?.warnings ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Ban className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Banned</span>
              <span className="ml-auto font-semibold">{s?.bannedIps ?? 0}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
