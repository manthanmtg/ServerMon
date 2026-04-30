/** @vitest-environment node */
import { afterEach, describe, expect, it } from 'vitest';
import { buildRunAsUserLaunchArgs, normalizeRunAsUser, RUN_AS_USER_AUTH_MODE } from './run-as-user';

describe('ai-runner run-as-user helpers', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: platform,
    });
  };

  it('leaves launch args unchanged when no target user is configured', () => {
    expect(
      buildRunAsUserLaunchArgs({
        shell: '/bin/bash',
        command: 'echo ok',
        requiresTTY: false,
      })
    ).toEqual(['/bin/bash', '-lc', 'echo ok']);
  });

  it('wraps non-interactive launches with passwordless sudo for the target user', () => {
    expect(
      buildRunAsUserLaunchArgs({
        shell: '/bin/bash',
        command: 'id -un',
        requiresTTY: false,
        runAsUser: 'servermon-ai',
        runAsUserAuthMode: RUN_AS_USER_AUTH_MODE,
      })
    ).toEqual(['sudo', '-n', '-E', '-u', 'servermon-ai', '--', '/bin/bash', '-lc', 'id -un']);
  });

  it('runs sudo inside the allocated TTY so the target user owns the shell session', () => {
    setPlatform('linux');

    expect(
      buildRunAsUserLaunchArgs({
        shell: '/bin/bash',
        command: 'printf tty',
        requiresTTY: true,
        runAsUser: 'servermon-ai',
        runAsUserAuthMode: RUN_AS_USER_AUTH_MODE,
      })
    ).toEqual([
      '/usr/bin/script',
      '-qefc',
      "sudo -n -E -u 'servermon-ai' -- '/bin/bash' -lc 'printf tty'",
      '/dev/null',
    ]);
  });

  it('normalizes blank users away and rejects unsafe sudo usernames', () => {
    expect(normalizeRunAsUser('  ')).toBeUndefined();
    expect(normalizeRunAsUser('servermon-ai')).toBe('servermon-ai');
    expect(() => normalizeRunAsUser('-root')).toThrow('Run as user must be a valid OS username');
  });
});
