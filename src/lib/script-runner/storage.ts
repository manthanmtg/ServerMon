import { stat } from 'node:fs/promises';
import { ScriptRunnerRun, ScriptRunnerScript } from '@/models/ScriptRunner';
import type { ScriptStorageUsage } from '@/modules/script-runner/types';
import { ACTIVE_STATUSES, outputPath, runnerHost } from './store';

const FILE_BATCH_SIZE = 32;

async function logSize(id: string) {
  try {
    return (await stat(outputPath(id))).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

export async function scriptStorageUsage(): Promise<ScriptStorageUsage[]> {
  const [scripts, runs] = await Promise.all([
    ScriptRunnerScript.find({ host: runnerHost }).select('title retention').lean(),
    ScriptRunnerRun.find({ host: runnerHost, status: { $nin: ACTIVE_STATUSES } })
      .select('scriptId logsPurgedAt')
      .lean(),
  ]);
  const scriptsById = new Map<string, ScriptStorageUsage>(
    scripts.map((script) => [
      script._id,
      {
        scriptId: script._id,
        title: script.title,
        retainedRuns: 0,
        logBytes: 0,
        retention: script.retention,
      },
    ])
  );
  const other = {
    scriptId: null,
    title: 'Ad hoc and deleted scripts',
    retainedRuns: 0,
    logBytes: 0,
  };
  for (let start = 0; start < runs.length; start += FILE_BATCH_SIZE) {
    await Promise.all(
      runs.slice(start, start + FILE_BATCH_SIZE).map(async (run) => {
        const row = (run.scriptId && scriptsById.get(run.scriptId)) || other;
        row.retainedRuns++;
        const bytes = run.logsPurgedAt ? 0 : await logSize(run._id);
        row.logBytes += bytes;
      })
    );
  }

  return [...scriptsById.values(), ...(other.retainedRuns > 0 ? [other] : [])].sort(
    (a, b) =>
      b.logBytes - a.logBytes || b.retainedRuns - a.retainedRuns || a.title.localeCompare(b.title)
  );
}
