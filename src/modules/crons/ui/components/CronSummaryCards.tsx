import type { LucideIcon } from 'lucide-react';
import { Calendar, Clock, Pause, Play, Timer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CronsSnapshot } from '../../types';

interface SummaryCardItem {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

interface CronSummaryCardsProps {
  summary?: CronsSnapshot['summary'];
}

export function CronSummaryCards({ summary }: CronSummaryCardsProps) {
  const cards: SummaryCardItem[] = [
    {
      label: 'Total Jobs',
      value: summary?.total ?? 0,
      icon: Clock,
      color: 'text-primary',
    },
    {
      label: 'Active',
      value: summary?.active ?? 0,
      icon: Play,
      color: 'text-success',
    },
    {
      label: 'Disabled',
      value: summary?.disabled ?? 0,
      icon: Pause,
      color: 'text-warning',
    },
    {
      label: 'User Crons',
      value: summary?.userCrons ?? 0,
      icon: Calendar,
      color: 'text-primary',
    },
    {
      label: 'System Crons',
      value: summary?.systemCrons ?? 0,
      icon: Timer,
      color: 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <Card key={label} className="border-border/60 bg-card/80 hover:border-primary/20 transition-all duration-300 hover:shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--primary)_15%,transparent)] group">
          <CardContent className="flex items-center justify-between p-4 min-h-[80px]">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground group-hover:text-foreground transition-colors duration-300">
                {label}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight group-hover:scale-105 origin-left transition-transform duration-300">{value}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors duration-300">
              <Icon className={cn('h-5 w-5 transition-transform duration-300 group-hover:scale-110', color)} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
