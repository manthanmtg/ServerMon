import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { PythonEnvironmentSelection } from '@/modules/python-environments/types';
import {
  SCRIPT_LANGUAGES,
  type ScriptDraft,
  type ScriptLanguage,
} from '@/modules/script-runner/types';

const execute = promisify(execFile);
const SUDO_PATH = '/usr/bin/sudo';
const CONTROL_PATH = '/usr/local/libexec/servermon-script-control';

type LaunchPayload = Pick<ScriptDraft, 'cwd' | 'args' | 'source'> &
  Partial<Pick<ScriptDraft, 'language' | 'env'>> & {
    pythonEnvironment?: PythonEnvironmentSelection;
  };

export function encodeLaunch(
  { cwd, args, source, language = 'bash', env = [], pythonEnvironment }: LaunchPayload,
  protocol = 2
) {
  if (pythonEnvironment && (protocol < 3 || language !== 'python')) {
    throw new Error('This launcher does not support the selected Python environment.');
  }
  if (protocol === 1) return [cwd, String(args.length), ...args, source].join('\0');
  return [
    pythonEnvironment ? 'script-runner-v3' : 'script-runner-v2',
    language,
    ...(pythonEnvironment ? [pythonEnvironment.environmentId, pythonEnvironment.revisionId] : []),
    cwd,
    String(args.length),
    ...args,
    String(env.length),
    ...env.flatMap(({ key, value }) => [key, value]),
    source,
  ].join('\0');
}

export interface RunnerCapabilities {
  protocol: number;
  runtimes: ScriptLanguage[];
}

export function parseRunnerProbe(output: string): RunnerCapabilities {
  const [header, ...available] = output.trim().split(/\r?\n/);
  if (header !== 'script-runner-v2') return { protocol: 1, runtimes: ['bash'] };
  return {
    protocol: available.includes('python-environments-v1') ? 3 : 2,
    runtimes: SCRIPT_LANGUAGES.filter((language) => available.includes(language)),
  };
}

export function parseUnit(output: string) {
  const properties = new Map(
    output
      .trim()
      .split('\n')
      .map((line) => {
        const equals = line.indexOf('=');
        return [line.slice(0, equals), line.slice(equals + 1)];
      })
  );
  const { LoadState, ActiveState, Result, ExecMainCode, ExecMainStatus } =
    Object.fromEntries(properties);
  const status = Number(ExecMainStatus);
  return {
    state: LoadState === 'not-found' ? 'missing' : ActiveState,
    result: Result,
    exitCode: ExecMainCode === '1' && Number.isInteger(status) ? status : null,
    signal:
      (ExecMainCode === '2' || ExecMainCode === '3') && Number.isInteger(status) ? status : null,
  };
}

export function startUnit(runId: string, timeoutSeconds: number) {
  return spawn(SUDO_PATH, ['-n', CONTROL_PATH, 'start', runId, String(timeoutSeconds)], {
    stdio: 'pipe',
  });
}

async function control(action: 'probe' | 'inspect' | 'stop' | 'forget', runId?: string) {
  const { stdout } = await execute(
    SUDO_PATH,
    ['-n', CONTROL_PATH, action, ...(runId ? [runId] : [])],
    { timeout: 15_000 }
  );
  return stdout;
}

export const probeRunner = async () => parseRunnerProbe(await control('probe'));
export const inspectUnit = async (id: string) => parseUnit(await control('inspect', id));
export const stopUnit = (id: string) => control('stop', id);
export const forgetUnit = (id: string) => control('forget', id);
