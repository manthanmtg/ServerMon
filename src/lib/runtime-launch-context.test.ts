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

  it('recognizes alternate systemd environment markers', () => {
    for (const marker of ['NOTIFY_SOCKET', 'MAINPID', 'MANAGERPID']) {
      expect(
        detectRuntimeLaunchContext({
          platform: 'linux',
          env: { [marker]: '1', NODE_ENV: 'test' } as NodeJS.ProcessEnv,
          stdinIsTTY: false,
          stdoutIsTTY: false,
          stderrIsTTY: false,
        })
      ).toMatchObject({
        kind: 'systemd',
        serviceManager: 'systemd',
        scheduleReliability: 'reboot-safe',
      });
    }
  });

  it('prefers systemd markers over tty state on linux', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'linux',
        env: { JOURNAL_STREAM: '9:999', NODE_ENV: 'test' } as NodeJS.ProcessEnv,
        stdinIsTTY: true,
        stdoutIsTTY: true,
        stderrIsTTY: true,
      })
    ).toMatchObject({
      kind: 'systemd',
      serviceManager: 'systemd',
      scheduleReliability: 'reboot-safe',
    });
  });

  it('ignores systemd markers on non-linux platforms', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'darwin',
        env: { INVOCATION_ID: 'abc123', NODE_ENV: 'test' } as NodeJS.ProcessEnv,
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

  it('treats any tty-backed stream as interactive', () => {
    const ttyStates = [
      { stdinIsTTY: true, stdoutIsTTY: false, stderrIsTTY: false },
      { stdinIsTTY: false, stdoutIsTTY: true, stderrIsTTY: false },
      { stdinIsTTY: false, stdoutIsTTY: false, stderrIsTTY: true },
    ];

    for (const state of ttyStates) {
      expect(
        detectRuntimeLaunchContext({
          platform: 'linux',
          env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
          ...state,
        })
      ).toMatchObject({
        kind: 'interactive',
        serviceManager: null,
        scheduleReliability: 'session-bound',
      });
    }
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

  it('prefers launchd markers over tty state on macOS', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'darwin',
        env: { XPC_SERVICE_NAME: 'com.servermon.servermon', NODE_ENV: 'test' } as NodeJS.ProcessEnv,
        stdinIsTTY: true,
        stdoutIsTTY: false,
        stderrIsTTY: false,
      })
    ).toMatchObject({
      kind: 'launchd',
      serviceManager: 'launchd',
      scheduleReliability: 'reboot-safe',
    });
  });

  it('ignores launchd markers on non-macOS platforms', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'linux',
        env: { LAUNCH_JOB_LABEL: 'com.servermon.servermon', NODE_ENV: 'test' } as NodeJS.ProcessEnv,
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

  it('describes systemd persistence in the summary', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'linux',
        env: { INVOCATION_ID: 'abc123', NODE_ENV: 'test' } as NodeJS.ProcessEnv,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        stderrIsTTY: false,
      }).summary
    ).toBe('Managed by systemd and expected to resume scheduled runs after reboot.');
  });

  it('describes launchd persistence in the summary', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'darwin',
        env: { LAUNCH_JOB_LABEL: 'com.servermon.servermon', NODE_ENV: 'test' } as NodeJS.ProcessEnv,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        stderrIsTTY: false,
      }).summary
    ).toBe('Managed by launchd and expected to resume scheduled runs after reboot.');
  });

  it('describes background launches as unconfirmed persistence', () => {
    expect(
      detectRuntimeLaunchContext({
        platform: 'linux',
        env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
        stdinIsTTY: false,
        stdoutIsTTY: false,
        stderrIsTTY: false,
      }).summary
    ).toBe(
      'Running in the background without systemd or launchd markers, so reboot persistence is not confirmed.'
    );
  });

  it('uses process defaults when no explicit input is provided', () => {
    const snapshot = detectRuntimeLaunchContext();

    expect(['interactive', 'systemd', 'launchd', 'background']).toContain(snapshot.kind);
    expect(['session-bound', 'reboot-safe', 'unknown']).toContain(snapshot.scheduleReliability);
  });
});
