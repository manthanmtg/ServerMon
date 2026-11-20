import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { ScriptDraft } from '@/modules/script-runner/types';

const execute = promisify(execFile);
const SUDO_PATH = '/usr/bin/sudo';
const CONTROL_PATH = '/usr/local/libexec/servermon-script-control';

export function encodeLaunch({ cwd, args, source }: Pick<ScriptDraft, 'cwd' | 'args' | 'source'>) {
  return [cwd, String(args.length), ...args, source].join('\0');
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

export const probeRunner = () => control('probe');
export const inspectUnit = async (id: string) => parseUnit(await control('inspect', id));
export const stopUnit = (id: string) => control('stop', id);
export const forgetUnit = (id: string) => control('forget', id);
