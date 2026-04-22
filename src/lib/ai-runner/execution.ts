import { randomUUID } from 'node:crypto';
import { execFile, spawn, spawnSync, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLogger } from '@/lib/logger';
import { shellEscape } from './shared';

const log = createLogger('ai-runner:execution');
const TEMP_ENV_DIR = path.join(os.tmpdir(), 'servermon-ai-runner');
const UNIT_PREFIX = 'servermon-airunner-job';
const SCRIPT_BIN = '/usr/bin/script';

let systemdIsolationAvailable: boolean | null = null;
let systemdIsolationProbe: Promise<boolean> | null = null;

export interface AIRunnerExecutionRef {
  pid?: number;
  unitName?: string;
}

export interface AIRunnerSpawnedCommand extends AIRunnerExecutionRef {
  child: ChildProcessByStdio<null, Readable, Readable>;
}

function sanitizeUnitSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9:-]/g, '-').slice(0, 48) || 'job';
}

function execFileAsync(
  file: string,
  args: string[],
  options?: Parameters<typeof execFile>[2]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const callback = (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        stdout: typeof stdout === 'string' ? stdout : stdout.toString(),
        stderr: typeof stderr === 'string' ? stderr : stderr.toString(),
      });
    };

    if (options) {
      execFile(file, args, options, callback);
      return;
    }

    execFile(file, args, callback);
  });
}

function buildExportFile(env: NodeJS.ProcessEnv): string {
  return Object.entries(env)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => `export ${key}=${shellEscape(value)}`)
    .join('\n');
}

async function writeEnvironmentFile(jobId: string, env: NodeJS.ProcessEnv): Promise<string> {
  await mkdir(TEMP_ENV_DIR, { recursive: true });
  const envPath = path.join(TEMP_ENV_DIR, `${sanitizeUnitSegment(jobId)}-${randomUUID()}.env`);
  await writeFile(envPath, `${buildExportFile(env)}\n`, { mode: 0o600 });
  return envPath;
}

async function lookupSystemdUnitMainPid(unitName: string): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync('systemctl', ['show', '--property=MainPID', '--value', unitName]);
    const value = Number(stdout.trim());
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function canUseSystemdIsolation(): Promise<boolean> {
  if (process.platform !== 'linux' || process.env.AI_RUNNER_DISABLE_SYSTEMD_ISOLATION === '1') {
    return false;
  }

  if (systemdIsolationAvailable !== null) {
    return systemdIsolationAvailable;
  }

  if (!systemdIsolationProbe) {
    systemdIsolationProbe = execFileAsync('systemd-run', ['--version'], { timeout: 3000 })
      .then(() => {
        systemdIsolationAvailable = true;
        return true;
      })
      .catch(() => {
        systemdIsolationAvailable = false;
        return false;
      })
      .finally(() => {
        systemdIsolationProbe = null;
      });
  }

  return systemdIsolationProbe;
}

export async function resolveAIRunnerExecutionPid(
  ref: AIRunnerExecutionRef
): Promise<number | undefined> {
  if (typeof ref.pid === 'number' && ref.pid > 0) {
    return ref.pid;
  }

  if (!ref.unitName) {
    return undefined;
  }

  return lookupSystemdUnitMainPid(ref.unitName);
}

export function terminateAIRunnerExecution(ref: AIRunnerExecutionRef): boolean {
  if (ref.unitName) {
    try {
      const result = spawnSync('systemctl', ['kill', ref.unitName], { stdio: 'ignore' });
      if (result.status === 0) {
        return true;
      }
    } catch (error) {
      log.warn(`Failed to kill AI Runner unit ${ref.unitName}`, error);
    }
  }

  if (!ref.pid) {
    return false;
  }

  try {
    process.kill(-ref.pid, 'SIGTERM');
    return true;
  } catch {
    try {
      process.kill(ref.pid, 'SIGTERM');
      return true;
    } catch {
      return false;
    }
  }
}

export async function spawnAIRunnerCommand(input: {
  jobId: string;
  shell: string;
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  requiresTTY?: boolean;
}): Promise<AIRunnerSpawnedCommand> {
  const useSystemdIsolation = await canUseSystemdIsolation();
  const launchArgs =
    input.requiresTTY && process.platform === 'linux'
      ? [SCRIPT_BIN, '-qefc', `${input.shell} -lc ${shellEscape(input.command)}`, '/dev/null']
      : [input.shell, '-lc', input.command];

  if (!useSystemdIsolation) {
    const child = spawn(launchArgs[0], launchArgs.slice(1), {
      cwd: input.cwd,
      env: input.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return {
      child,
      pid: child.pid ?? undefined,
    };
  }

  const envPath = await writeEnvironmentFile(input.jobId, input.env);
  const unitName = `${UNIT_PREFIX}-${sanitizeUnitSegment(input.jobId)}-${Date.now()}`;
  const launchCommand = [
    'set -a',
    `. ${shellEscape(envPath)}`,
    `rm -f ${shellEscape(envPath)}`,
    `exec ${shellEscape(input.shell)} -lc ${shellEscape(input.command)}`,
  ].join('; ');

  const child = spawn(
    'systemd-run',
    [
      '--quiet',
      '--collect',
      '--service-type=exec',
      '--unit',
      unitName,
      '--property=KillMode=control-group',
      '--slice',
      'servermon-ai-runner.slice',
      '--working-directory',
      input.cwd,
      '--pipe',
      ...(input.requiresTTY
        ? [SCRIPT_BIN, '-qefc', `/bin/sh -lc ${shellEscape(launchCommand)}`, '/dev/null']
        : ['/bin/sh', '-lc', launchCommand]),
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const cleanupEnvFile = () =>
    rm(envPath, {
      force: true,
    }).catch(() => undefined);

  child.once('error', () => {
    void cleanupEnvFile();
  });
  child.once('close', () => {
    void cleanupEnvFile();
  });

  return {
    child,
    unitName,
  };
}
