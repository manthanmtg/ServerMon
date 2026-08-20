/** @vitest-environment node */
import { mkdir, mkdtemp, readlink, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindById,
  mockFindOneAndUpdate,
  mockUpdateMany,
  mockUpdateOne,
  mockDeployNextJsApp,
  mockPrepareGitSourceForDeploy,
} = vi.hoisted(() => ({
  mockFindById: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockUpdateOne: vi.fn(),
  mockDeployNextJsApp: vi.fn(),
  mockPrepareGitSourceForDeploy: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn() }));
vi.mock('@/models/ManagedApp', () => ({
  default: {
    findById: mockFindById,
    findOneAndUpdate: mockFindOneAndUpdate,
    updateMany: mockUpdateMany,
    updateOne: mockUpdateOne,
  },
}));
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

import {
  APP_UPDATE_TIMEOUT_ERROR,
  APP_UPDATE_TIMEOUT_MS,
  deployManagedApp,
  reconcileStaleAppUpdateOperations,
  rollbackManagedApp,
  updateManagedGitApp,
} from './service';

describe('updateManagedGitApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates update operations with a one-hour deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T00:00:00.000Z'));
    const save = vi.fn(() => Promise.resolve());
    const app = {
      _id: { toString: () => 'app-1' },
      id: 'app-1',
      name: 'Git Portal',
      slug: 'git-portal',
      templateId: 'nextjs',
      sourceType: 'git',
      sourcePath: undefined,
      gitUrl: 'https://github.com/acme/git-portal.git',
      gitBranch: 'main',
      gitCurrentSha: 'old-sha',
      autoUpdate: { enabled: true, intervalMinutes: 60 },
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
      releases: [],
      operations: [],
      save,
    };
    mockFindOneAndUpdate.mockResolvedValue(app);
    mockPrepareGitSourceForDeploy.mockResolvedValue({
      sourcePath: '/srv/servermon/apps/git-portal/repository',
      previousSha: 'old-sha',
      remoteSha: 'old-sha',
      currentSha: 'old-sha',
      changed: false,
      cloned: false,
      logs: ['$ git fetch origin main'],
    });

    await updateManagedGitApp('app-1');

    expect(app.operations.at(-1)).toMatchObject({
      type: 'update',
      deadlineAt: new Date('2026-05-07T01:00:00.000Z'),
    });
    expect(APP_UPDATE_TIMEOUT_MS).toBe(60 * 60_000);
    vi.useRealTimers();
  });

  it('marks expired running update operations as failed during reconciliation', async () => {
    mockUpdateMany.mockResolvedValue({ matchedCount: 2, modifiedCount: 2 });

    const now = new Date('2026-05-07T01:00:00.000Z');
    const result = await reconcileStaleAppUpdateOperations({ now });

    expect(result).toEqual({ matched: 2, modified: 2 });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: {
          $elemMatch: expect.objectContaining({
            type: 'update',
            status: 'running',
          }),
        },
      }),
      expect.any(Array),
      { updatePipeline: true }
    );
  });

  it('does not overwrite an update timeout with a late unchanged completion', async () => {
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
      autoUpdate: { enabled: true, intervalMinutes: 60 },
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
      releases: [],
      operations: [],
      save,
    };
    mockFindOneAndUpdate.mockResolvedValue(app);
    mockFindById.mockResolvedValue({
      ...app,
      operations: [
        {
          id: 'update-timeout',
          type: 'update',
          status: 'failed',
          title: 'Manual update',
          step: 'Update timed out',
          startedAt: new Date('2026-05-07T00:00:00.000Z'),
          completedAt: new Date('2026-05-07T01:00:00.000Z'),
          error: APP_UPDATE_TIMEOUT_ERROR,
          logs: [APP_UPDATE_TIMEOUT_ERROR],
        },
      ],
    });
    mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    mockPrepareGitSourceForDeploy.mockResolvedValue({
      sourcePath: '/srv/servermon/apps/git-portal/repository',
      previousSha: 'old-sha',
      remoteSha: 'old-sha',
      currentSha: 'old-sha',
      changed: false,
      cloned: false,
      logs: ['$ git fetch origin main'],
    });

    const result = await updateManagedGitApp('app-1');

    expect(result.app.operations.at(-1)).toMatchObject({
      status: 'failed',
      step: 'Update timed out',
      error: APP_UPDATE_TIMEOUT_ERROR,
    });
    expect(save).not.toHaveBeenCalled();
    expect(mockUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'app-1',
        operations: { $elemMatch: { id: expect.any(String), status: 'running' } },
      }),
      expect.any(Object)
    );
  });

  it('aborts a live update after the one-hour deadline and records a failed timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T00:00:00.000Z'));
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
      autoUpdate: { enabled: true, intervalMinutes: 60 },
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
      releases: [{ id: 'old-release', status: 'active', createdAt: new Date(), logs: [] }],
      operations: [],
      save,
    };
    mockFindOneAndUpdate.mockResolvedValue(app);
    mockPrepareGitSourceForDeploy.mockResolvedValue({
      sourcePath: '/srv/servermon/apps/git-portal/repository',
      previousSha: 'old-sha',
      remoteSha: 'new-sha',
      currentSha: 'new-sha',
      changed: true,
      cloned: false,
      logs: ['$ git fetch origin main'],
    });
    mockDeployNextJsApp.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          if (!signal) {
            resolve({
              releaseId: 'missing-signal',
              status: 'failed',
              error: 'missing signal',
              logs: [],
            });
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              const reason = signal.reason;
              resolve({
                releaseId: 'timeout-release',
                status: 'failed',
                error: reason instanceof Error ? reason.message : 'aborted',
                logs: [reason instanceof Error ? reason.message : 'aborted'],
              });
            },
            { once: true }
          );
        })
    );

    const updatePromise = updateManagedGitApp('app-1');
    await vi.advanceTimersByTimeAsync(APP_UPDATE_TIMEOUT_MS);
    const result = await updatePromise;

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') throw new Error('Expected update to fail after timeout');
    expect(result.error).toBe(APP_UPDATE_TIMEOUT_ERROR);
    expect(app.operations.at(-1)).toMatchObject({
      status: 'failed',
      step: 'Update timed out',
      error: APP_UPDATE_TIMEOUT_ERROR,
    });
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
    mockFindOneAndUpdate.mockResolvedValue(app);
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

  it('records scheduled updates separately from manual update clicks', async () => {
    const save = vi.fn(() => Promise.resolve());
    const app = {
      _id: { toString: () => 'app-1' },
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
      operations: [],
      save,
    };
    mockFindById.mockResolvedValue(app);
    mockFindOneAndUpdate.mockResolvedValue(app);
    mockPrepareGitSourceForDeploy.mockResolvedValue({
      sourcePath: '/srv/servermon/apps/git-portal/repository',
      previousSha: 'old-sha',
      remoteSha: 'old-sha',
      currentSha: 'old-sha',
      changed: false,
      cloned: false,
      logs: ['$ git fetch origin main'],
    });

    await updateManagedGitApp('app-1', { trigger: 'auto' });

    expect(app.operations.at(-1)).toMatchObject({
      type: 'update',
      title: 'Auto update',
      status: 'unchanged',
      step: 'No upstream changes found',
    });
  });

  it('rejects a new update when the app already has a running update operation', async () => {
    const save = vi.fn(() => Promise.resolve());
    const app = {
      _id: { toString: () => 'app-1' },
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
      releases: [],
      operations: [
        {
          id: 'update-running',
          type: 'update',
          status: 'running',
          title: 'Manual update',
          step: 'Building release',
          startedAt: new Date('2026-05-07T00:00:00.000Z'),
          logs: ['$ pnpm build'],
        },
      ],
      save,
    };
    mockFindOneAndUpdate.mockResolvedValue(null);
    mockFindById.mockResolvedValue(app);

    await expect(updateManagedGitApp('app-1')).rejects.toThrow(
      'An update is already running for app app-1'
    );
    expect(mockPrepareGitSourceForDeploy).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(app.operations).toHaveLength(1);
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
