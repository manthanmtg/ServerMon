import type { ManagedAppDTO } from '../types';

export function readManagedAppsList(payload: unknown): ManagedAppDTO[] {
  if (!payload || typeof payload !== 'object') return [];

  const apps = (payload as { apps?: unknown }).apps;
  return Array.isArray(apps) ? (apps as ManagedAppDTO[]) : [];
}
