import { writeFile, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createLogger } from '@/lib/logger';
import type { Executor, ExecutorResult, ExecutorPayload } from './executor';
import { ShellExecutor } from './shell-executor';

const log = createLogger('self-service:script-executor');

export class ScriptExecutor implements Executor {
  private shell = new ShellExecutor();

  async execute(
    payload: ExecutorPayload,
    onLog: (line: string) => void,
  ): Promise<ExecutorResult> {
    const logs: string[] = [];
    const scriptContent = payload.script;

    if (!scriptContent) {
      return { success: false, logs: [], error: 'No install script provided' };
    }

    const scriptPath = join(tmpdir(), `servermon-install-${randomUUID()}.sh`);

    try {
      onLog('Writing install script...');
      logs.push('Writing install script...');
      await writeFile(scriptPath, scriptContent, 'utf-8');
      await chmod(scriptPath, 0o755);

      onLog(`Executing script: ${scriptPath}`);
      logs.push(`Executing script: ${scriptPath}`);

      const result = await this.shell.execute(
        { method: 'script', commands: [`bash ${scriptPath}`] },
        (line) => {
          logs.push(line);
          onLog(line);
        },
      );

      if (!result.success) {
        return { success: false, logs, error: result.error || 'Script execution failed' };
      }

      onLog('Script executed successfully.');
      logs.push('Script executed successfully.');
      return { success: true, logs };
    } catch (err: unknown) {
      const error = err as { message?: string };
      const msg = error.message || 'Script execution failed';
      log.error('Script executor failed', err);
      onLog(`ERROR: ${msg}`);
      logs.push(`ERROR: ${msg}`);
      return { success: false, logs, error: msg };
    } finally {
      try {
        await unlink(scriptPath);
      } catch {
        // cleanup best-effort
      }
    }
  }
}

export function createScriptExecutor(): Executor {
  return new ScriptExecutor();
}
