import { describe, expect, it } from 'vitest';
import { detectRuntimeLaunchContext } from './runtime-launch-context';

describe('detectRuntimeLaunchContext', () => {
  it('detects systemd-managed runtimes on linux', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'linux',
        env: { INVOCATION_ID: 'abc123', NODE_ENV: 'test' } as NodeJS.ProcessEnv,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        stderrIsTTY: false,
      })
    ).toMatchObject({
      kind: 'systemd',
      serviceManager: 'systemd',
      scheduleReliability: 'reboot-safe',
    });
  });

  it('treats tty-backed launches as session-bound', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'darwin',
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
        stdinIsTTY: true,
        stdoutIsTTY: true,
        stderrIsTTY: false,
      })
    ).toMatchObject({
      kind: 'interactive',
      serviceManager: null,
      scheduleReliability: 'session-bound',
    });
  });

  it('detects launchd-managed runtimes on macOS', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'darwin',
        env: {
          LAUNCH_JOB_LABEL: 'com.servermon.servermon',
          NODE_ENV: 'test',
        } as NodeJS.ProcessEnv,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        stderrIsTTY: false,
      })
    ).toMatchObject({
      kind: 'launchd',
      serviceManager: 'launchd',
      scheduleReliability: 'reboot-safe',
    });
  });

  it('marks detached background launches without systemd markers as unknown', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'linux',
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        stderrIsTTY: false,
      })
    ).toMatchObject({
      kind: 'background',
      serviceManager: null,
      scheduleReliability: 'unknown',
    });
  });
});
