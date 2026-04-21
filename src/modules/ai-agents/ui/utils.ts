import type { SessionStatus } from '../types';
import { statusColors } from './constants';

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

export function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
