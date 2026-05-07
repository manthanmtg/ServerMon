/** @vitest-environment node */
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

import { deployManagedApp, updateManagedGitApp } from './service';

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
