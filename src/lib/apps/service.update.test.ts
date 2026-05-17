/** @vitest-environment node */
import { mkdir, mkdtemp, readlink, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindById, mockDeployNextJsApp, mockPrepareGitSourceForDeploy } = vi.hoisted(() => ({
  mockFindById: vi.fn(),
  mockDeployNextJsApp: vi.fn(),
  mockPrepareGitSourceForDeploy: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn() }));
vi.mock('@/models/ManagedApp', () => ({ default: { findById: mockFindById } }));
vi.mock('./deploy', async () => {
  const actual = await vi.importActual<typeof import('./deploy')>('./deploy');
  return {
    ...actual,
    deployNextJsApp: mockDeployNextJsApp,
  };
});
vi.mock('./git', async () => {
  const actual = await vi.importActual<typeof import('./git')>('./git');
  return {
    ...actual,
    prepareGitSourceForDeploy: mockPrepareGitSourceForDeploy,
  };
});

import { deployManagedApp, rollbackManagedApp, updateManagedGitApp } from './service';

describe('updateManagedGitApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the running app status and active release when an update build fails', async () => {
    const savedStatuses: string[] = [];
    const save = vi.fn(function (this: { status: string }) {
      savedStatuses.push(this.status);
      return Promise.resolve();
    });
    const app = {
      _id: 'app-1',
      id: 'app-1',
      name: 'Git Portal',
      slug: 'git-portal',
      templateId: 'nextjs',
      sourceType: 'git',
      sourcePath: undefined,
      gitUrl: 'https://github.com/acme/git-portal.git',
      gitBranch: 'main',
      gitCurrentSha: 'old-sha',
      autoUpdate: {
        enabled: true,
        intervalMinutes: 60,
      },
      domain: 'git.example.com',
      port: 3010,
      commands: {
        install: 'pnpm install --frozen-lockfile',
        build: 'pnpm build',
        start: 'pnpm start',
      },
      envVars: new Map(),
      healthCheckPath: '/',
      tlsEnabled: false,
      status: 'running',
      currentReleaseId: 'old-release',
      releases: [
        {
          id: 'old-release',
          status: 'active',
          createdAt: new Date('2026-05-07T00:00:00.000Z'),
          activatedAt: new Date('2026-05-07T00:01:00.000Z'),
          logs: ['old release ok'],
        },
      ],
      save,
    };
    mockFindById.mockResolvedValue(app);
    mockPrepareGitSourceForDeploy.mockResolvedValue({
      sourcePath: '/srv/servermon/apps/git-portal/repository',
      previousSha: 'old-sha',
      remoteSha: 'new-sha',
      currentSha: 'new-sha',
      changed: true,
      cloned: false,
      logs: ['$ git fetch origin main'],
    });
    mockDeployNextJsApp.mockResolvedValue({
      releaseId: 'failed-release',
      status: 'failed',
      error: 'Command failed: pnpm build',
      logs: ['build failed'],
    });

    const result = await updateManagedGitApp('app-1');

    expect(result.status).toBe('failed');
    expect(app.status).toBe('running');
    expect(app.currentReleaseId).toBe('old-release');
    expect(app.releases).toEqual([
      expect.objectContaining({ id: 'old-release', status: 'active' }),
      expect.objectContaining({
        id: 'failed-release',
        status: 'failed',
        error: 'Command failed: pnpm build',
      }),
    ]);
    expect(app.autoUpdate).toMatchObject({
      lastStatus: 'failed',
      lastError: 'Command failed: pnpm build',
    });
    expect(savedStatuses).not.toContain('deploying');
  });
});

describe('deployManagedApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates git app checkouts to the configured remote branch before manual deploys', async () => {
    const save = vi.fn(() => Promise.resolve());
    const app = {
      _id: 'app-1',
      id: 'app-1',
      name: 'Git Portal',
      slug: 'git-portal',
      templateId: 'nextjs',
      sourceType: 'git',
      sourcePath: undefined,
      gitUrl: 'https://github.com/acme/git-portal.git',
      gitBranch: 'main',
      gitCurrentSha: 'old-sha',
      autoUpdate: {
        enabled: true,
        intervalMinutes: 60,
      },
      domain: 'git.example.com',
      port: 3010,
      commands: {
        install: 'pnpm install --frozen-lockfile',
        build: 'pnpm build',
        start: 'pnpm start',
      },
      envVars: new Map(),
      healthCheckPath: '/',
      tlsEnabled: false,
      status: 'running',
      currentReleaseId: 'old-release',
      releases: [
        {
          id: 'old-release',
          status: 'active',
          createdAt: new Date('2026-05-07T00:00:00.000Z'),
          activatedAt: new Date('2026-05-07T00:01:00.000Z'),
          logs: ['old release ok'],
        },
      ],
      save,
    };
    mockFindById.mockResolvedValue(app);
    mockPrepareGitSourceForDeploy.mockResolvedValue({
      sourcePath: '/srv/servermon/apps/git-portal/repository',
      previousSha: 'old-sha',
      remoteSha: 'new-sha',
      currentSha: 'new-sha',
      changed: true,
      cloned: false,
      logs: ['$ git fetch origin main', '$ git reset --hard origin/main'],
    });
    mockDeployNextJsApp.mockResolvedValue({
      releaseId: 'new-release',
      status: 'active',
      logs: ['deployed'],
    });

    const result = await deployManagedApp('app-1');

    expect(result.status).toBe('active');
    expect(mockPrepareGitSourceForDeploy).toHaveBeenCalledWith(
      expect.objectContaining({ updateToRemote: true })
    );
    expect(mockDeployNextJsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        app: expect.objectContaining({
          sourcePath: '/srv/servermon/apps/git-portal/repository',
        }),
      })
    );
    expect(app.gitCurrentSha).toBe('new-sha');
    expect(app.currentReleaseId).toBe('new-release');
  });
});

describe('rollbackManagedApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches current to an earlier release, restarts the service, and records an operation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'servermon-rollback-'));
    vi.stubEnv('SERVERMON_APPS_ROOT', root);
    try {
      const oldRelease = path.join(root, 'git-portal', 'releases', 'old-release');
      const newRelease = path.join(root, 'git-portal', 'releases', 'new-release');
      await mkdir(path.join(oldRelease, 'source'), { recursive: true });
      await mkdir(path.join(newRelease, 'source'), { recursive: true });
      await symlink(newRelease, path.join(root, 'git-portal', 'current'));

      const save = vi.fn(() => Promise.resolve());
      const app = {
        _id: { toString: () => 'app-1' },
        id: 'app-1',
        name: 'Git Portal',
        slug: 'git-portal',
        templateId: 'nextjs',
        sourceType: 'git',
        gitUrl: 'https://github.com/acme/git-portal.git',
        gitBranch: 'main',
        autoUpdate: {
          enabled: true,
          intervalMinutes: 60,
        },
        domain: 'git.example.com',
        port: 3010,
        commands: {
          install: 'pnpm install --frozen-lockfile',
          build: 'pnpm build',
          start: 'pnpm start',
        },
        envVars: new Map(),
        healthCheckPath: '/',
        tlsEnabled: false,
        status: 'running',
        currentReleaseId: 'new-release',
        releases: [
          {
            id: 'old-release',
            status: 'superseded',
            createdAt: new Date('2026-05-07T00:00:00.000Z'),
            activatedAt: new Date('2026-05-07T00:01:00.000Z'),
            logs: ['old release ok'],
          },
          {
            id: 'new-release',
            status: 'active',
            createdAt: new Date('2026-05-07T01:00:00.000Z'),
            activatedAt: new Date('2026-05-07T01:01:00.000Z'),
            logs: ['new release ok'],
          },
        ],
        operations: [],
        save,
      };
      const commands: string[] = [];
      mockFindById.mockResolvedValue(app);

      const result = await rollbackManagedApp('app-1', 'old-release', {
        commandRunner: async ({ command }) => {
          commands.push(command);
          return { code: 0, output: 'ok' };
        },
        healthCheck: async (url) => ({ ok: url === 'http://127.0.0.1:3010/' }),
      });

      expect(result.status).toBe('active');
      expect(app.currentReleaseId).toBe('old-release');
      expect(app.releases).toEqual([
        expect.objectContaining({ id: 'old-release', status: 'active' }),
        expect.objectContaining({ id: 'new-release', status: 'superseded' }),
      ]);
      expect(app.operations.at(-1)).toMatchObject({
        type: 'rollback',
        status: 'succeeded',
        releaseId: 'old-release',
      });
      expect(commands).toEqual(['systemctl restart servermon-app-git-portal.service']);
      await expect(readlink(path.join(root, 'git-portal', 'current'))).resolves.toBe(oldRelease);
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });
});
