export const RUN_AS_USER_AUTH_MODE = 'passwordless-sudo' as const;
export type AIRunnerRunAsUserAuthMode = typeof RUN_AS_USER_AUTH_MODE;

const OS_USERNAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,62}\$?$/;
const SCRIPT_BIN = '/usr/bin/script';

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function normalizeRunAsUser(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!OS_USERNAME_PATTERN.test(trimmed)) {
    throw new Error('Run as user must be a valid OS username');
  }
  return trimmed;
}

export function buildRunAsUserLaunchArgs(input: {
  shell: string;
  command: string;
  requiresTTY?: boolean;
  runAsUser?: string;
  runAsUserAuthMode?: AIRunnerRunAsUserAuthMode;
}): string[] {
  const runAsUser = normalizeRunAsUser(input.runAsUser);
  const useTTY = Boolean(input.requiresTTY) && process.platform === 'linux';

  if (!runAsUser) {
    return useTTY
      ? [SCRIPT_BIN, '-qefc', `${input.shell} -lc ${shellEscape(input.command)}`, '/dev/null']
      : [input.shell, '-lc', input.command];
  }

  if (input.runAsUserAuthMode && input.runAsUserAuthMode !== RUN_AS_USER_AUTH_MODE) {
    throw new Error('Unsupported run as user auth mode');
  }

  if (useTTY) {
    const sudoCommand = [
      'sudo',
      '-n',
      '-E',
      '-u',
      shellEscape(runAsUser),
      '--',
      shellEscape(input.shell),
      '-lc',
      shellEscape(input.command),
    ].join(' ');
    return [SCRIPT_BIN, '-qefc', sudoCommand, '/dev/null'];
  }

  return ['sudo', '-n', '-E', '-u', runAsUser, '--', input.shell, '-lc', input.command];
}
