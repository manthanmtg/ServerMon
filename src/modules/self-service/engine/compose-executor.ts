import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@/lib/logger';
import type { Executor, ExecutorResult, ExecutorPayload } from './executor';
import { ShellExecutor } from './shell-executor';

const log = createLogger('self-service:compose-executor');

export class ComposeExecutor implements Executor {
  private shell = new ShellExecutor();

  async execute(payload: ExecutorPayload, onLog: (line: string) => void): Promise<ExecutorResult> {
    const logs: string[] = [];
    const composeContent = payload.composeContent;
    const composeDir = payload.composeDir;

    if (!composeContent || !composeDir) {
      return { success: false, logs: [], error: 'Missing compose content or directory' };
    }

    try {
      onLog(`Creating directory: ${composeDir}`);
      logs.push(`Creating directory: ${composeDir}`);
      await mkdir(composeDir, { recursive: true });

      const composePath = join(composeDir, 'docker-compose.yml');
      onLog(`Writing docker-compose.yml to ${composePath}`);
      logs.push(`Writing docker-compose.yml to ${composePath}`);
      await writeFile(composePath, composeContent, 'utf-8');

      onLog('Running docker compose up -d...');
      logs.push('Running docker compose up -d...');

      const result = await this.shell.execute(
        {
          method: 'docker-compose',
          commands: [`cd ${composeDir} && docker compose up -d`],
        },
        (line) => {
          logs.push(line);
          onLog(line);
        }
      );

      if (!result.success) {
        return { success: false, logs, error: result.error || 'docker compose up failed' };
      }

      onLog('Docker Compose services started successfully.');
      logs.push('Docker Compose services started successfully.');
      return { success: true, logs };
    } catch (err: unknown) {
      const error = err as { message?: string };
      const msg = error.message || 'Compose execution failed';
      log.error('Compose executor failed', err);
      onLog(`ERROR: ${msg}`);
      logs.push(`ERROR: ${msg}`);
      return { success: false, logs, error: msg };
    }
  }
}

export function createComposeExecutor(): Executor {
  return new ComposeExecutor();
}
