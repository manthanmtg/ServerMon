import type { SessionStatus } from '../types';
import { statusColors } from './constants';
import { relativeTime } from '@/lib/utils';
export { relativeTime };

export type StatusVariant = 'success' | 'warning' | 'destructive' | 'secondary' | 'default';

export function statusVariant(status: SessionStatus | string): StatusVariant {
  if (status === 'running') return 'success';
  if (status === 'idle') return 'warning';
  if (status === 'error') return 'destructive';
  if (status === 'waiting') return 'default';
  return 'secondary';
}

export function statusTextColor(status: SessionStatus | string): string {
  return statusColors[status as SessionStatus] ?? 'text-muted-foreground';
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'just started';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
