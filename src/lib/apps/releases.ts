import { rm } from 'node:fs/promises';
import { createLogger } from '@/lib/logger';
import AppOperationModel from '@/models/AppOperation';
import AppsSettings from '@/models/AppsSettings';
import ManagedApp from '@/models/ManagedApp';
import { getReleaseRoot } from './paths';

const log = createLogger('apps:releases');

export const DEFAULT_APP_RELEASE_RETENTION = 10;
export const MIN_APP_RELEASE_RETENTION = 1;
export const MAX_APP_RELEASE_RETENTION = 50;

const APPS_SETTINGS_ID = 'apps-settings';

export interface AppReleasePruneResult {
  removedReleaseIds: string[];
  diskErrors: Array<{ releaseId: string; message: string }>;
}

export interface PrunableAppRelease {
  id: string;
  status: 'building' | 'active' | 'failed' | 'superseded';
  createdAt: Date | string;
}

export interface PrunableApp {
  _id: { toString: () => string } | string;
  slug: string;
  currentReleaseId?: string;
  activeReleaseId?: string;
  releases?: PrunableAppRelease[];
}

export interface PruneAppReleasesOptions {
  retention?: number;
  appsRoot?: string;
}

function clampRetention(value: unknown): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_APP_RELEASE_RETENTION;
  return Math.min(
    MAX_APP_RELEASE_RETENTION,
    Math.max(MIN_APP_RELEASE_RETENTION, Math.trunc(numeric))
  );
}

export async function readAppReleaseRetention(): Promise<number> {
  try {
    const settings = await AppsSettings.findById(APPS_SETTINGS_ID).lean<{
      releaseRetention?: number;
    } | null>();
    return clampRetention(settings?.releaseRetention);
  } catch (error: unknown) {
    log.warn('Failed to read apps settings for release retention', error);
    return DEFAULT_APP_RELEASE_RETENTION;
  }
}

function releaseTimestamp(release: PrunableAppRelease): number {
  const value = release.createdAt;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

async function activeOperationReleaseIds(appId: string): Promise<Set<string>> {
  const protectedIds = new Set<string>();
  const operations = await AppOperationModel.find({ appId, active: true })
    .select('targetReleaseId releaseId')
    .lean<Array<{ targetReleaseId?: string; releaseId?: string }>>();
  for (const operation of operations) {
    if (operation.targetReleaseId) protectedIds.add(operation.targetReleaseId);
    if (operation.releaseId) protectedIds.add(operation.releaseId);
  }
  return protectedIds;
}

/**
 * Trims an app's release history to the configured retention limit.
 *
 * The current/active release and any release referenced by an active queue
 * operation are always preserved. Removals cover both the MongoDB release
 * records and the on-disk release directories. Never throws: failures are
 * logged and pruning is skipped when protection state cannot be verified.
 */
export async function pruneAppReleases(
  app: PrunableApp,
  options: PruneAppReleasesOptions = {}
): Promise<AppReleasePruneResult> {
  const emptyResult: AppReleasePruneResult = { removedReleaseIds: [], diskErrors: [] };
  try {
    const keep = clampRetention(options.retention ?? (await readAppReleaseRetention()));
    const releases = [...(app.releases ?? [])].sort(
      (a, b) => releaseTimestamp(a) - releaseTimestamp(b)
    );
    const removeCount = releases.length - keep;
    if (removeCount <= 0) return emptyResult;

    const protectedIds = new Set<string>();
    if (app.currentReleaseId) protectedIds.add(app.currentReleaseId);
    if (app.activeReleaseId) protectedIds.add(app.activeReleaseId);
    for (const release of releases) {
      if (release.status === 'active') protectedIds.add(release.id);
    }
    const appId = typeof app._id === 'string' ? app._id : app._id.toString();
    const operationRefs = await activeOperationReleaseIds(appId);
    for (const id of operationRefs) protectedIds.add(id);

    const removable = releases
      .filter((release) => !protectedIds.has(release.id))
      .slice(0, removeCount);

    if (!removable.length) return emptyResult;
    const removedIds = removable.map((release) => release.id);

    try {
      await ManagedApp.updateOne(
        { _id: appId },
        { $pull: { releases: { id: { $in: removedIds } } } }
      );
    } catch (error: unknown) {
      log.warn(`Failed to prune release records for app ${app.slug}`, error);
      return emptyResult;
    }

    const diskErrors: Array<{ releaseId: string; message: string }> = [];
    for (const releaseId of removedIds) {
      try {
        await rm(getReleaseRoot(app.slug, releaseId, options.appsRoot), {
          recursive: true,
          force: true,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to remove release files';
        diskErrors.push({ releaseId, message });
        log.warn(`Failed to remove release directory ${releaseId} for app ${app.slug}`, error);
      }
    }

    log.info(`Pruned ${removedIds.length} release(s) for app ${app.slug}`);
    return { removedReleaseIds: removedIds, diskErrors };
  } catch (error: unknown) {
    log.warn(`Failed to prune releases for app ${app.slug}`, error);
    return emptyResult;
  }
}

/** Prunes every app whose release history exceeds the configured retention. */
export async function pruneAllAppReleases(): Promise<{ appsPruned: number }> {
  try {
    const retention = await readAppReleaseRetention();
    const apps = await ManagedApp.find({}).lean<Array<PrunableApp>>();
    const oversized = apps.filter((app) => (app.releases?.length ?? 0) > retention);
    let appsPruned = 0;
    for (const app of oversized) {
      const result = await pruneAppReleases(app, { retention });
      if (result.removedReleaseIds.length) appsPruned += 1;
    }
    return { appsPruned };
  } catch (error: unknown) {
    log.warn('Failed to prune app releases across all apps', error);
    return { appsPruned: 0 };
  }
}
