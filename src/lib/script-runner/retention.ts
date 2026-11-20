import { rm } from 'node:fs/promises';
import { createLogger } from '@/lib/logger';
import { ScriptRunnerRun } from '@/models/ScriptRunner';
import {
  ACTIVE_STATUSES,
  findRun,
  outputPath,
  resultPath,
  runnerDefaults,
  runnerHost,
  runnerSettings,
} from './store';

const log = createLogger('script-runner:retention');
const DAY_MS = 86_400_000;
const BATCH_SIZE = 250;

async function removeRunFiles(id: string) {
  await Promise.all(
    [outputPath(id), resultPath(id), `${resultPath(id)}.tmp`].map((path) =>
      rm(path, { force: true })
    )
  );
}

export async function pruneRuns(now: number) {
  const { historyRetentionDays, maxHistoryRuns, logRetentionDays } = runnerDefaults(
    await runnerSettings()
  );
  const terminal = { host: runnerHost, status: { $nin: ACTIVE_STATUSES } };
  const overflow = await ScriptRunnerRun.findOne(terminal)
    .sort({ createdAt: -1, _id: -1 })
    .skip(maxHistoryRuns)
    .select('createdAt')
    .lean();
  const expiredHistory = await ScriptRunnerRun.find({
    ...terminal,
    $or: [
      { createdAt: { $lte: new Date(now - historyRetentionDays * DAY_MS) } },
      ...(overflow
        ? [
            { createdAt: { $lt: overflow.createdAt } },
            { createdAt: overflow.createdAt, _id: { $lte: overflow._id } },
          ]
        : []),
    ],
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(BATCH_SIZE)
    .select('_id')
    .lean();

  for (const { _id: id } of expiredHistory) {
    try {
      // Keep the record available for retries until its files have been removed.
      await removeRunFiles(id);
      await findRun(id).deleteOne({ status: terminal.status });
    } catch (error) {
      log.warn('Could not prune script run history', { id, error });
    }
  }

  const expiredLogs = await ScriptRunnerRun.find({
    ...terminal,
    finishedAt: { $lte: new Date(now - logRetentionDays * DAY_MS) },
    logsPurgedAt: null,
  })
    .sort({ finishedAt: 1 })
    .limit(BATCH_SIZE)
    .select('_id')
    .lean();
  for (const { _id: id } of expiredLogs) {
    try {
      await removeRunFiles(id);
      await findRun(id).updateOne(
        { logsPurgedAt: null },
        { $set: { logsPurgedAt: new Date(now) } }
      );
    } catch (error) {
      log.warn('Could not prune script run logs', { id, error });
    }
  }

  return expiredHistory.length === BATCH_SIZE || expiredLogs.length === BATCH_SIZE;
}
