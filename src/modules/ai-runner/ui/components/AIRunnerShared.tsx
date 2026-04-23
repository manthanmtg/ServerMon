'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Bot, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getPresetIcon, isUploadedIcon } from '../utils';

export function FieldHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      role="tooltip"
      aria-label={text}
      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
    >
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}

export function LabelWithHint({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      {label}
      {hint ? <FieldHint text={hint} /> : null}
    </span>
  );
}

export function CompactStat({
  label,
  value,
  tone = 'default',
  detail,
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning';
  detail?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3',
        tone === 'primary' && 'border-primary/20 bg-primary/5',
        tone === 'success' && 'border-success/20 bg-success/5',
        tone === 'warning' && 'border-warning/20 bg-warning/5',
        tone === 'default' && 'border-border/60 bg-card/60'
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function ProfileIconPreview({
  icon,
  name,
  className,
}: {
  icon?: string;
  name: string;
  className?: string;
}) {
  const preset = getPresetIcon(icon);

  if (isUploadedIcon(icon) && icon) {
    return (
      <div
        className={cn(
          'relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-border bg-card',
          className
        )}
      >
        <Image src={icon} alt={`${name} icon`} fill sizes="40px" className="object-cover" />
      </div>
    );
  }

  const Icon = preset?.icon ?? Bot;
  return (
    <div
      role="img"
      aria-label={`${name} icon`}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-primary',
        className
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  accent?: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
          <div className={cn('rounded-lg bg-secondary p-2', accent)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
