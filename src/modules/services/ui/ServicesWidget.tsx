'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Cog, Play, Power, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WidgetCardSkeleton } from '@/components/ui/skeleton';
import { resilientFetch } from '@/lib/fetch-utils';
import { cn } from '@/lib/utils';
import type { ServicesSnapshot } from '../types';

const MotionCard = motion.create(Card);

function isServicesWidgetSnapshot(value: unknown): value is ServicesSnapshot {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  const summary = candidate.summary;
  if (!summary || typeof summary !== 'object') return false;

  const candidateSummary = summary as Record<string, unknown>;
  const hasFiniteNumber = (field: string) =>
    typeof candidateSummary[field] === 'number' && Number.isFinite(candidateSummary[field]);

  return (
    (candidate.source === 'systemd' || candidate.source === 'mock') &&
    typeof candidate.systemdAvailable === 'boolean' &&
    Array.isArray(candidate.alerts) &&
    hasFiniteNumber('total') &&
    hasFiniteNumber('running') &&
    hasFiniteNumber('failed') &&
    hasFiniteNumber('inactive') &&
    hasFiniteNumber('healthScore')
  );
}

function MiniGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--destructive)';
  return (
    <div className="relative w-12 h-12">
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
        <span className="text-[10px] font-bold">{score}</span>
      </div>
    </div>
  );
}

export default function ServicesWidget() {
  const [snapshot, setSnapshot] = useState<ServicesSnapshot | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadRequestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestSequence = ++loadRequestSequence.current;

    try {
      const res = await resilientFetch('/api/modules/services', {
        cache: 'no-store',
        timeout: 5000,
        retries: 2,
        retryDelay: 500,
      });
      if (!res.ok) throw new Error(`Services endpoint responded with ${res.status}`);

      const data: unknown = await res.json();
      if (!isServicesWidgetSnapshot(data)) {
        throw new Error('Services endpoint returned an invalid snapshot');
      }

      if (requestSequence !== loadRequestSequence.current) return;

      setSnapshot(data);
      setLoadFailed(false);
    } catch {
      if (requestSequence === loadRequestSequence.current) {
        setLoadFailed(true);
      }
    } finally {
      if (requestSequence === loadRequestSequence.current) {
        setInitialLoad(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 10000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (initialLoad && !snapshot) {
    return <WidgetCardSkeleton />;
  }

  if (loadFailed && !snapshot) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex min-h-36 items-center gap-3 p-5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div role="alert">
            <p className="text-sm font-medium text-foreground">Unable to load service status</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Retrying automatically.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const s = snapshot?.summary;

  return (
    <MotionCard
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01, y: -2, transition: { duration: 0.2, ease: 'easeOut' } }}
      whileTap={{ scale: 0.995, y: 0, transition: { duration: 0.1, ease: 'easeOut' } }}
      tabIndex={0}
      className="overflow-hidden border border-border/70 bg-card/85 shadow-sm shadow-black/10 backdrop-blur-sm transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:shadow-sm hover:shadow-primary/25 hover:border-primary/40 active:scale-[0.998]"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Cog className="w-4 h-4 text-primary" />
            Services
          </CardTitle>
          <Badge
            variant={snapshot?.systemdAvailable ? 'success' : 'warning'}
            className="text-[10px]"
          >
            {snapshot?.source || 'unknown'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="overflow-hidden">
        {loadFailed && (
          <p role="status" className="mb-3 flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Showing last service reading
          </p>
        )}
        <motion.div layout className="flex items-center gap-4">
          <MiniGauge score={s?.healthScore ?? 0} />
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              <Play className="w-3 h-3 text-success" />
              <span className="text-muted-foreground">Running</span>
              <span className="ml-auto font-semibold">{s?.running ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="w-3 h-3 text-destructive" />
              <span className="text-muted-foreground">Failed</span>
              <span
                className={cn('ml-auto font-semibold', (s?.failed ?? 0) > 0 && 'text-destructive')}
              >
                {s?.failed ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Power className="w-3 h-3 text-warning" />
              <span className="text-muted-foreground">Inactive</span>
              <span className="ml-auto font-semibold">{s?.inactive ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Total</span>
              <span className="ml-auto font-semibold">{s?.total ?? 0}</span>
            </div>
          </div>
        </motion.div>
        <AnimatePresence>
          {(snapshot?.alerts.length ?? 0) > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <span className="text-destructive font-medium">
                {snapshot?.alerts.length} active alert
                {(snapshot?.alerts.length ?? 0) !== 1 ? 's' : ''}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </MotionCard>
  );
}
