import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import ManagedApp from '@/models/ManagedApp';
import { updateManagedGitApp } from './service';

const log = createLogger('apps:auto-update');

export interface GitAppAutoUpdateSummary {
  checked: number;
  updated: number;
  unchanged: number;
  failed: number;
}

function dueGitAppAutoUpdateQuery(before: Date) {
  return {
    sourceType: 'git',
    'autoUpdate.enabled': true,
    $or: [
      { 'autoUpdate.nextRunAt': { $exists: false } },
      { 'autoUpdate.nextRunAt': { $lte: before } },
    ],
  };
}

export async function countDueGitAppAutoUpdates(before = new Date()): Promise<number> {
  await connectDB();
  return ManagedApp.countDocuments(dueGitAppAutoUpdateQuery(before));
}

export async function runDueGitAppAutoUpdates(now = new Date()): Promise<GitAppAutoUpdateSummary> {
  await connectDB();
  const apps = await ManagedApp.find(dueGitAppAutoUpdateQuery(now)).lean<
    Array<{ _id: { toString: () => string } | string }>
  >();

  const summary: GitAppAutoUpdateSummary = {
    checked: apps.length,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };

  for (const app of apps) {
    const appId = app._id.toString();
    try {
      const result = await updateManagedGitApp(appId, { trigger: 'auto' });
      if (result.status === 'unchanged') summary.unchanged += 1;
      else if (result.status === 'active') summary.updated += 1;
      else summary.failed += 1;
    } catch (error) {
      summary.failed += 1;
      log.error('Git app auto update failed', { appId, error });
    }
  }

  return summary;
}
