export type RuntimeLaunchContextKind = 'interactive' | 'systemd' | 'launchd' | 'background';
export type RuntimeScheduleReliability = 'session-bound' | 'reboot-safe' | 'unknown';

export interface RuntimeLaunchContextSnapshot {
  kind: RuntimeLaunchContextKind;
  serviceManager: 'systemd' | 'launchd' | null;
  scheduleReliability: RuntimeScheduleReliability;
  summary: string;
}

export interface RuntimeLaunchContextInput {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
  stderrIsTTY?: boolean;
}

function hasSystemdMarkers(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.INVOCATION_ID || env.JOURNAL_STREAM || env.NOTIFY_SOCKET || env.MAINPID || env.MANAGERPID
  );
}

function hasLaunchdMarkers(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.LAUNCH_JOB_LABEL || env.XPC_SERVICE_NAME);
}

export function detectRuntimeLaunchContext(
  input: RuntimeLaunchContextInput = {}
): RuntimeLaunchContextSnapshot {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  const stdinIsTTY = input.stdinIsTTY ?? process.stdin.isTTY ?? false;
  const stdoutIsTTY = input.stdoutIsTTY ?? process.stdout.isTTY ?? false;
  const stderrIsTTY = input.stderrIsTTY ?? process.stderr.isTTY ?? false;

  if (platform === 'linux' && hasSystemdMarkers(env)) {
    return {
      kind: 'systemd',
      serviceManager: 'systemd',
      scheduleReliability: 'reboot-safe',
      summary: 'Managed by systemd and expected to resume scheduled runs after reboot.',
    };
  }

  if (platform === 'darwin' && hasLaunchdMarkers(env)) {
    return {
      kind: 'launchd',
      serviceManager: 'launchd',
      scheduleReliability: 'reboot-safe',
      summary: 'Managed by launchd and expected to resume scheduled runs after reboot.',
    };
  }

  if (stdinIsTTY || stdoutIsTTY || stderrIsTTY) {
    return {
      kind: 'interactive',
      serviceManager: null,
      scheduleReliability: 'session-bound',
      summary:
        'Running from an interactive session, so scheduled runs stop when this process exits.',
    };
  }

  return {
    kind: 'background',
    serviceManager: null,
    scheduleReliability: 'unknown',
    summary:
      'Running in the background without systemd or launchd markers, so reboot persistence is not confirmed.',
  };
}
