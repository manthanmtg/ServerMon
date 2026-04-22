'use client';

import { cn } from '@/lib/utils';
import type { HttpMethod } from '../../../types';
import { METHOD_COLORS } from './constants';

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
