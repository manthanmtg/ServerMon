'use client';

import { memo } from 'react';
import { Bot, CircleDot, Clock, XCircle, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AgentsSnapshot } from '../../types';

interface Props {
  snapshot: AgentsSnapshot | null;
}

interface CardSpec {
  label: string;
  key: 'total' | 'running' | 'idle' | 'error';
  icon: LucideIcon;
  color: string;
}

const CARD_SPECS: readonly CardSpec[] = [
  { label: 'Total', key: 'total', icon: Bot, color: 'text-foreground' },
  { label: 'Running', key: 'running', icon: CircleDot, color: 'text-success' },
  { label: 'Idle', key: 'idle', icon: Clock, color: 'text-warning' },
  { label: 'Error', key: 'error', icon: XCircle, color: 'text-destructive' },
] as const;

function SummaryCardsInner({ snapshot }: Props) {
  const summary = snapshot?.summary;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARD_SPECS.map((spec) => {
        const Icon = spec.icon;
        const value = summary?.[spec.key] ?? 0;
        return (
          <Card key={spec.label} className="border-border/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div
                className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center bg-secondary',
                  spec.color
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold leading-none">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{spec.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export const SummaryCards = memo(SummaryCardsInner);
