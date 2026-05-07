/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  ensureGitCheckout,
  getRemoteHeadSha,
  isHttpsGitUrl,
  prepareGitSourceForDeploy,
} from './git';

describe('apps git helpers', () => {
  it('accepts only HTTPS git URLs for managed git apps', () => {
    expect(isHttpsGitUrl('https://github.com/acme/app.git')).toBe(true);
    expect(isHttpsGitUrl('http://github.com/acme/app.git')).toBe(false);
    expect(isHttpsGitUrl('git@github.com:acme/app.git')).toBe(false);
  });

  it('clones a missing checkout into the managed repository path', async () => {
    const commands: string[] = [];

    const result = await ensureGitCheckout({
      repoUrl: 'https://github.com/acme/app.git',
      branch: 'main',
      repositoryPath: '/srv/servermon-apps/app/repository',
      pathExists: async () => false,
      commandRunner: async ({ command }) => {
        commands.push(command);
        return { code: 0, output: command.includes('rev-parse') ? 'abc123\n' : '' };
      },
    });

    expect(commands).toEqual([
      "git clone --branch main --single-branch 'https://github.com/acme/app.git' '/srv/servermon-apps/app/repository'",
      'git rev-parse HEAD',
    ]);
    expect(result).toMatchObject({ currentSha: 'abc123', cloned: true });
  });

  it('fetches an existing checkout and reports the current SHA', async () => {
    const commands: string[] = [];

    const result = await ensureGitCheckout({
      repoUrl: 'https://github.com/acme/app.git',
      branch: 'main',
      repositoryPath: '/srv/servermon-apps/app/repository',
      pathExists: async () => true,
      commandRunner: async ({ command }) => {
        commands.push(command);
        if (command === 'git config --get remote.origin.url') {
          return { code: 0, output: 'https://github.com/acme/app.git\n' };
        }
        if (command === 'git rev-parse HEAD') return { code: 0, output: 'abc123\n' };
        return { code: 0, output: '' };
      },
    });

    expect(commands).toEqual([
      'git config --get remote.origin.url',
      'git fetch origin main',
      'git rev-parse HEAD',
    ]);
    expect(result).toMatchObject({ currentSha: 'abc123', cloned: false });
  });

  it('reads the remote branch SHA without mutating the checkout', async () => {
    const commands: string[] = [];

    const sha = await getRemoteHeadSha({
      branch: 'main',
      repositoryPath: '/srv/servermon-apps/app/repository',
      commandRunner: async ({ command }) => {
        commands.push(command);
        return { code: 0, output: 'def456\trefs/remotes/origin/main\n' };
      },
    });

    expect(commands).toEqual(['git ls-remote origin refs/heads/main']);
    expect(sha).toBe('def456');
  });

  it('updates an existing checkout only when requested', async () => {
    const commands: string[] = [];
    let reset = false;

    const result = await prepareGitSourceForDeploy({
      repoUrl: 'https://github.com/acme/app.git',
      branch: 'main',
      repositoryPath: '/srv/servermon-apps/app/repository',
      updateToRemote: true,
      pathExists: async () => true,
      commandRunner: async ({ command }) => {
        commands.push(command);
        if (command === 'git config --get remote.origin.url') {
          return { code: 0, output: 'https://github.com/acme/app.git\n' };
        }
        if (command === 'git rev-parse HEAD') {
          return { code: 0, output: reset ? 'def456\n' : 'abc123\n' };
        }
        if (command === 'git ls-remote origin refs/heads/main') {
          return { code: 0, output: 'def456\trefs/heads/main\n' };
        }
        if (command === 'git reset --hard origin/main') reset = true;
        return { code: 0, output: '' };
      },
    });

    expect(commands).toContain('git reset --hard origin/main');
    expect(result).toMatchObject({
      sourcePath: '/srv/servermon-apps/app/repository',
      previousSha: 'abc123',
      remoteSha: 'def456',
      changed: true,
    });
  });
});
