import path from 'node:path';
import { sanitizeAppSlug } from './rendering';

export function getAppsRoot(): string {
  return process.env.SERVERMON_APPS_ROOT || '/var/lib/servermon/apps';
}

export function getAppRoot(appSlug: string, appsRoot = getAppsRoot()): string {
  return path.join(appsRoot, sanitizeAppSlug(appSlug));
}

export function getReleaseRoot(
  appSlug: string,
  releaseId: string,
  appsRoot = getAppsRoot()
): string {
  return path.join(getAppRoot(appSlug, appsRoot), 'releases', releaseId);
}
