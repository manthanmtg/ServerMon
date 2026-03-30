'use client';

import { cn } from '@/lib/utils';
import type { HttpMethod } from '../../../types';

export const METHOD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GET: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  POST: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/30' },
  PUT: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30' },
  PATCH: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30' },
  DELETE: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
};

export function MethodBadge({ method, size = 'sm' }: { method: HttpMethod; size?: 'sm' | 'lg' }) {
  const colors = METHOD_COLORS[method] || METHOD_COLORS.GET;
  return (
    <span
      className={cn(
        'inline-flex items-center font-mono font-bold rounded-md border transition-shadow shadow-sm',
        colors.bg,
        colors.text,
        colors.border,
        size === 'lg' ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]'
      )}
    >
      {method}
    </span>
  );
}
