'use client';

import { CheckCircle, Cog, Play, Power, Shield, ShieldAlert, Square, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ServicesSnapshot } from '../../types';

interface ServicesSummaryGridProps {
  summary?: ServicesSnapshot['summary'];
  alertsCount: number;
}

function healthScoreColor(score: number): string {
  if (score >= 90) return 'text-success';
  if (score >= 70) return 'text-warning';
  return 'text-destructive';
}

function HealthGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke={
            score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--destructive)'
          }
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-2xl font-bold', healthScoreColor(score))}>{score}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Health</span>
      </div>
    </div>
  );
}

export function ServicesSummaryGrid({ summary, alertsCount }: ServicesSummaryGridProps) {
  const cards = [
    {
      label: 'Running',
      value: summary?.running ?? 0,
      icon: Play,
      color: 'text-success',
    },
    {
      label: 'Failed',
      value: summary?.failed ?? 0,
      icon: XCircle,
      color: 'text-destructive',
    },
    {
      label: 'Inactive',
      value: summary?.inactive ?? 0,
      icon: Power,
      color: 'text-warning',
    },
    { label: 'Total', value: summary?.total ?? 0, icon: Cog, color: 'text-primary' },
    {
      label: 'Enabled',
      value: summary?.enabled ?? 0,
      icon: CheckCircle,
      color: 'text-success',
    },
    {
      label: 'Disabled',
      value: summary?.disabled ?? 0,
      icon: Shield,
      color: 'text-muted-foreground',
    },
    {
      label: 'Exited',
      value: summary?.exited ?? 0,
      icon: Square,
      color: 'text-muted-foreground',
    },
    {
      label: 'Alerts',
      value: alertsCount,
      icon: ShieldAlert,
      color: alertsCount > 0 ? 'text-destructive' : 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card className="border-border/60 bg-card/80 sm:col-span-2 lg:col-span-1 lg:row-span-2">
        <CardContent className="flex flex-col items-center justify-center p-5 min-h-[180px]">
          <HealthGauge score={summary?.healthScore ?? 0} />
          <p className="mt-2 text-xs text-muted-foreground uppercase tracking-wider">
            System Health
          </p>
        </CardContent>
      </Card>
      {cards.map(({ label, value, icon: Icon, color }) => (
        <Card key={label} className="border-border/60 bg-card/80">
          <CardContent className="flex items-center justify-between p-4 min-h-[80px]">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5">
              <Icon className={cn('h-5 w-5', color)} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
