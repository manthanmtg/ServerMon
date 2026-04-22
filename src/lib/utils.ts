export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatBytes(bytes?: number | null, system: 'binary' | 'decimal' = 'binary') {
  if (bytes === undefined || bytes === null || bytes === 0) return '0 B';
  if (bytes < 0) return '0 B';
  const k = system === 'binary' ? 1024 : 1000;
  const sizes =
    system === 'binary' ? ['B', 'KiB', 'MiB', 'GiB', 'TiB'] : ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 secs';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
  if (m > 0) parts.push(`${m} min${m !== 1 ? 's' : ''}`);
  if (s > 0 || parts.length === 0) parts.push(`${s} sec${s !== 1 ? 's' : ''}`);

  return parts.join(' ');
}
 
export function relativeTime(value?: string | number | Date | null): string {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
