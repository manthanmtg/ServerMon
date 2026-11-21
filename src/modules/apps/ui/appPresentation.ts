import type { ManagedAppDTO } from '../types';

export type AppsCollectionFilter = 'all' | 'running' | 'attention' | 'busy';

export interface FilterAppsOptions {
  query: string;
  filter: AppsCollectionFilter;
  snapshotUnavailable: boolean;
  busyAppIds?: ReadonlySet<string>;
}

function normalized(value: string | undefined): string {
  return value?.toLocaleLowerCase() ?? '';
}

function hasSearchMatch(app: ManagedAppDTO, query: string): boolean {
  if (!query) return true;
  return [app.name, app.domain, app.slug, app.git?.url, app.git?.branch, app.sourcePath]
    .map(normalized)
    .some((value) => value.includes(query));
}

function needsAttention(app: ManagedAppDTO, snapshotUnavailable: boolean): boolean {
  if (snapshotUnavailable || app.status === 'failed' || app.status === 'unknown') return true;
  if (app.runtime && !app.runtime.available) return true;
  const autoUpdate = app.git?.autoUpdate;
  return Boolean(
    autoUpdate &&
    (autoUpdate.lastStatus === 'failed' ||
      autoUpdate.blockReason === 'worker_unavailable' ||
      autoUpdate.blockReason === 'scheduler_stale' ||
      Boolean(autoUpdate.retryAt))
  );
}

function isBusy(app: ManagedAppDTO, busyAppIds: ReadonlySet<string>): boolean {
  return (
    busyAppIds.has(app.id) ||
    app.status === 'deploying' ||
    app.operations.some((operation) => operation.status === 'running')
  );
}

export function sortAppsByName<T extends Pick<ManagedAppDTO, 'id' | 'name'>>(apps: T[]): T[] {
  return [...apps].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
      left.id.localeCompare(right.id)
  );
}

export function filterApps(apps: ManagedAppDTO[], options: FilterAppsOptions): ManagedAppDTO[] {
  const query = options.query.trim().toLocaleLowerCase();
  const busyAppIds = options.busyAppIds ?? new Set<string>();
  return sortAppsByName(apps).filter((app) => {
    if (!hasSearchMatch(app, query)) return false;
    if (options.filter === 'running') return app.status === 'running';
    if (options.filter === 'busy') return isBusy(app, busyAppIds);
    if (options.filter === 'attention') return needsAttention(app, options.snapshotUnavailable);
    return true;
  });
}

export function getAppMonogram(app: Pick<ManagedAppDTO, 'name' | 'slug'>): string {
  const words = (app.name.trim() || app.slug).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word[0]?.toLocaleUpperCase() ?? '');
  return (letters.join('') || app.slug.slice(0, 2).toLocaleUpperCase() || 'AP').slice(0, 2);
}

export function getAppPublicUrl(app: Pick<ManagedAppDTO, 'domain' | 'tlsEnabled'>): string {
  return `${app.tlsEnabled ? 'https' : 'http'}://${app.domain}`;
}

export function formatAppRelativeTime(
  value: string | undefined,
  now: Date,
  fallback = '—'
): string {
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback;
  const deltaMinutes = Math.round(Math.abs(timestamp - now.getTime()) / 60_000);
  const future = timestamp > now.getTime();
  if (deltaMinutes < 1) return future ? 'in a moment' : 'just now';
  const unit =
    deltaMinutes < 60
      ? ['min', deltaMinutes]
      : deltaMinutes < 1440
        ? ['hour', Math.round(deltaMinutes / 60)]
        : deltaMinutes < 43_200
          ? ['day', Math.round(deltaMinutes / 1440)]
          : ['month', Math.round(deltaMinutes / 43_200)];
  const [label, amount] = unit as [string, number];
  const plural = label === 'min' ? '' : amount === 1 ? '' : 's';
  return future ? `in ${amount} ${label}${plural}` : `${amount} ${label}${plural} ago`;
}

export function formatAppBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
