import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createLogger } from '@/lib/logger';
import { writeAIRunnerLogEntry } from './logs';

const log = createLogger('ai-runner:processes');
const SUPERVISOR_COOLDOWN_MS = 10_000;

let lastSupervisorSpawnAt = 0;

function getTsxCliPath(): string {
  return path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
}

function getScriptPath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

function spawnDetachedProcess(args: string[], env: Record<string, string | undefined>): number {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, ...env },
    stdio: 'ignore',
  });
  child.unref();
  return child.pid ?? 0;
}

export function ensureAIRunnerSupervisor(): void {
  if (process.env.NODE_ENV === 'test' || process.env.AI_RUNNER_DISABLE_SUPERVISOR === '1') {
    return;
  }

  const now = Date.now();
  if (now - lastSupervisorSpawnAt < SUPERVISOR_COOLDOWN_MS) {
    return;
  }

  lastSupervisorSpawnAt = now;

  try {
    const pid = spawnDetachedProcess([getTsxCliPath(), getScriptPath('./supervisor-entry.ts')], {
      AI_RUNNER_PROCESS_KIND: 'supervisor',
      AI_RUNNER_SUPERVISOR_INSTANCE_ID: randomUUID(),
    });
    log.debug(`Spawned AI Runner supervisor process ${pid}`);
    void writeAIRunnerLogEntry({
      level: 'info',
      component: 'ai-runner:processes',
      event: 'supervisor.spawned',
      message: 'Spawned detached AI Runner supervisor process',
      data: { pid },
    });
  } catch (error) {
    log.error('Failed to spawn AI Runner supervisor', error);
    void writeAIRunnerLogEntry({
      level: 'error',
      component: 'ai-runner:processes',
      event: 'supervisor.spawn_failed',
      message: 'Failed to spawn detached AI Runner supervisor process',
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export function spawnAIRunnerWorker(jobId: string, supervisorId: string): number {
  const pid = spawnDetachedProcess([getTsxCliPath(), getScriptPath('./worker-entry.ts'), jobId], {
    AI_RUNNER_PROCESS_KIND: 'worker',
    AI_RUNNER_SUPERVISOR_INSTANCE_ID: supervisorId,
    AI_RUNNER_JOB_ID: jobId,
  });
  void writeAIRunnerLogEntry({
    level: 'info',
    component: 'ai-runner:processes',
    event: 'worker.spawned',
    message: 'Spawned detached AI Runner worker process',
    data: {
      pid,
      jobId,
      supervisorId,
    },
  });
  return pid;
}
