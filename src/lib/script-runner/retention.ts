import { rm } from 'node:fs/promises';
import type { QueryFilter } from 'mongoose';
import { createLogger } from '@/lib/logger';
import {
  ScriptRunnerRun,
  ScriptRunnerScript,
  ScriptRunnerSettings,
  type RunRecord,
} from '@/models/ScriptRunner';
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
const terminal = { host: runnerHost, status: { $nin: ACTIVE_STATUSES } };

async function removeRunFiles(id: string) {
  await Promise.all(
    [outputPath(id), resultPath(id), `${resultPath(id)}.tmp`].map((path) =>
      rm(path, { force: true })
    )
  );
}

async function overflowRules(filter: QueryFilter<RunRecord>, count: number) {
  const overflow = await ScriptRunnerRun.findOne({ ...terminal, ...filter })
    .sort({ createdAt: -1, _id: -1 })
    .skip(count)
    .select('createdAt')
    .lean();
  return overflow
    ? [
        { ...filter, createdAt: { $lt: overflow.createdAt } },
        { ...filter, createdAt: overflow.createdAt, _id: { $lte: overflow._id } },
      ]
    : [];
}

async function pruneHistory(filter: QueryFilter<RunRecord>, perScript = false) {
  const records = await ScriptRunnerRun.find({ ...terminal, ...filter })
    .sort({ createdAt: 1, _id: 1 })
    .limit(BATCH_SIZE)
    .select('_id')
    .lean();

  let deleted = 0;
  for (const { _id: id } of records) {
    try {
      // Keep the record available for retries until its files have been removed.
      await removeRunFiles(id);
      const result = await findRun(id).deleteOne({ status: terminal.status });
      deleted += result.deletedCount;
    } catch (error) {
      log.warn('Could not prune script run history', { id, error });
    }
  }

  if (perScript && deleted > 0) {
    await ScriptRunnerSettings.updateOne(
      { _id: runnerHost },
      { $inc: { historyPruneVersion: 1 } },
      { upsert: true }
    );
  }
  return records.length === BATCH_SIZE;
}

export async function pruneRuns(now: number) {
  const [settings, scripts] = await Promise.all([
    runnerSettings(),
    ScriptRunnerScript.find({ host: runnerHost, retention: { $exists: true } })
      .select('retention')
      .lean(),
  ]);
  const defaults = runnerDefaults(settings);
  const scriptHistory: QueryFilter<RunRecord>[] = [];
  const logExpiry: QueryFilter<RunRecord>[] = [
    { finishedAt: { $lte: new Date(now - defaults.logRetentionDays * DAY_MS) } },
  ];
  for (const { _id: scriptId, retention } of scripts) {
    if (!retention) continue;
    const { historyRetentionDays, maxHistoryRuns, logRetentionDays } = retention;
    if (
      historyRetentionDays !== undefined &&
      historyRetentionDays < defaults.historyRetentionDays
    ) {
      scriptHistory.push({
        scriptId,
        createdAt: { $lte: new Date(now - historyRetentionDays * DAY_MS) },
      });
    }
    if (maxHistoryRuns !== undefined && maxHistoryRuns < defaults.maxHistoryRuns) {
      scriptHistory.push(...(await overflowRules({ scriptId }, maxHistoryRuns)));
    }
    if (logRetentionDays !== undefined && logRetentionDays < defaults.logRetentionDays) {
      logExpiry.push({ scriptId, finishedAt: { $lte: new Date(now - logRetentionDays * DAY_MS) } });
    }
  }

  // Apply tighter limits first so the global count doesn't remove other scripts' runs unnecessarily.
  const scriptBacklog =
    scriptHistory.length > 0 && (await pruneHistory({ $or: scriptHistory }, true));
  const historyBacklog = await pruneHistory({
    $or: [
      { createdAt: { $lte: new Date(now - defaults.historyRetentionDays * DAY_MS) } },
      ...(scriptBacklog ? [] : await overflowRules({}, defaults.maxHistoryRuns)),
    ],
  });
  const expiredLogs = await ScriptRunnerRun.find({
    ...terminal,
    logsPurgedAt: null,
    $or: logExpiry,
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

  return scriptBacklog || historyBacklog || expiredLogs.length === BATCH_SIZE;
}
