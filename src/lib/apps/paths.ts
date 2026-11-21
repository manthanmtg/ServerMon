import path from 'node:path';
import { sanitizeAppSlug } from './rendering';

export function getAppsRoot(): string {
  return process.env.SERVERMON_APPS_ROOT || '/var/lib/servermon/apps';
}

export function getAppRoot(appSlug: string, appsRoot = getAppsRoot()): string {
  return path.join(appsRoot, sanitizeAppSlug(appSlug));
}

export function getAppRepositoryRoot(appSlug: string, appsRoot = getAppsRoot()): string {
  return path.join(getAppRoot(appSlug, appsRoot), 'repository');
}

function assertSafeReleaseId(releaseId: string): void {
  if (
    releaseId.trim() !== releaseId ||
    releaseId.includes('/') ||
    releaseId.includes('\\') ||
    releaseId.includes('..') ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(releaseId)
  ) {
    throw new Error('Release id must be a safe directory name');
  }
}

export function getReleaseRoot(
  appSlug: string,
  releaseId: string,
  appsRoot = getAppsRoot()
): string {
  assertSafeReleaseId(releaseId);
  return path.join(getAppRoot(appSlug, appsRoot), 'releases', releaseId);
}
