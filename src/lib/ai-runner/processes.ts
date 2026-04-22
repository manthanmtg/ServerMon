import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai-runner:processes');
let supervisorPromise: Promise<void> | null = null;

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

  if (supervisorPromise) {
    return;
  }

  supervisorPromise = import('./supervisor')
    .then(async ({ AIRunnerSupervisor }) => {
      log.debug('Starting AI Runner supervisor loop');
      await new AIRunnerSupervisor().run();
    })
    .catch((error) => {
      log.error('AI Runner supervisor stopped unexpectedly', error);
    })
    .finally(() => {
      supervisorPromise = null;
    });
}

export function spawnAIRunnerWorker(jobId: string, supervisorId: string): number {
  return spawnDetachedProcess([getTsxCliPath(), getScriptPath('./worker-entry.ts'), jobId], {
    AI_RUNNER_PROCESS_KIND: 'worker',
    AI_RUNNER_SUPERVISOR_INSTANCE_ID: supervisorId,
    AI_RUNNER_JOB_ID: jobId,
  });
}
