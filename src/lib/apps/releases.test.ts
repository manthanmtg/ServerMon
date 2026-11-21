/** @vitest-environment node */
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { mockAppsSettingsFindById, mockAppOperationFind, mockManagedAppUpdateOne, mockManagedAppFind } =
  vi.hoisted(() => ({
    mockAppsSettingsFindById: vi.fn(),
    mockAppOperationFind: vi.fn(),
    mockManagedAppUpdateOne: vi.fn(),
    mockManagedAppFind: vi.fn(),
  }));

vi.mock('@/models/AppsSettings', () => ({
  default: { findById: mockAppsSettingsFindById },
}));
vi.mock('@/models/AppOperation', () => ({
  default: { find: mockAppOperationFind },
}));
vi.mock('@/models/ManagedApp', () => ({
  default: { updateOne: mockManagedAppUpdateOne, find: mockManagedAppFind },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  DEFAULT_APP_RELEASE_RETENTION,
  type PrunableApp,
  type PrunableAppRelease,
  pruneAllAppReleases,
  pruneAppReleases,
  readAppReleaseRetention,
} from './releases';

const tempDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function makeApp(overrides: Partial<PrunableApp> = {}): PrunableApp {
  return {
    _id: { toString: () => 'app-id-1' },
    slug: 'demo-app',
    currentReleaseId: undefined,
    activeReleaseId: undefined,
    releases: [],
    ...overrides,
  };
}

function release(
  id: string,
  index: number,
  status: PrunableAppRelease['status'] = 'superseded'
): PrunableAppRelease {
  return { id, status, createdAt: new Date(Date.UTC(2026, 0, 1 + index)) };
}

async function createReleaseDirs(slug: string, ids: string[]): Promise<string> {
  const appsRoot = await mkdtemp(path.join(os.tmpdir(), 'servermon-releases-'));
  tempDirs.push(appsRoot);
  for (const id of ids) {
    await mkdir(path.join(appsRoot, slug, 'releases', id), { recursive: true });
  }
  return appsRoot;
}

describe('readAppReleaseRetention', () => {
  it('returns the configured retention', async () => {
    mockAppsSettingsFindById.mockReturnValue({
      lean: () => Promise.resolve({ releaseRetention: 25 }),
    });
    expect(await readAppReleaseRetention()).toBe(25);
  });

  it('falls back to the default when settings are missing', async () => {
    mockAppsSettingsFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
    expect(await readAppReleaseRetention()).toBe(DEFAULT_APP_RELEASE_RETENTION);
  });

  it('falls back to the default when the settings lookup fails', async () => {
    mockAppsSettingsFindById.mockImplementation(() => {
      throw new Error('db unavailable');
    });
    expect(await readAppReleaseRetention()).toBe(DEFAULT_APP_RELEASE_RETENTION);
  });

  it('clamps out-of-range settings values', async () => {
    mockAppsSettingsFindById.mockReturnValue({
      lean: () => Promise.resolve({ releaseRetention: 999 }),
    });
    expect(await readAppReleaseRetention()).toBe(50);
    mockAppsSettingsFindById.mockReturnValue({
      lean: () => Promise.resolve({ releaseRetention: -3 }),
    });
    expect(await readAppReleaseRetention()).toBe(1);
  });
});

describe('pruneAppReleases', () => {
  beforeEach(() => {
    mockManagedAppUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockAppOperationFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([]) }),
    });
  });

  it('keeps every release when within the retention limit', async () => {
    const app = makeApp({
      releases: [release('r1', 1), release('r2', 2), release('r3', 3)],
    });
    const result = await pruneAppReleases(app, { retention: 10 });

    expect(result).toEqual({ removedReleaseIds: [], diskErrors: [] });
    expect(mockManagedAppUpdateOne).not.toHaveBeenCalled();
  });

  it('removes the oldest releases beyond the limit from records and disk', async () => {
    const ids = ['r1', 'r2', 'r3', 'r4'];
    const appsRoot = await createReleaseDirs('demo-app', ids);
    const app = makeApp({
      currentReleaseId: 'r4',
      releases: [release('r1', 1), release('r2', 2), release('r3', 3), release('r4', 4, 'active')],
    });

    const result = await pruneAppReleases(app, { retention: 2, appsRoot });

    expect(result.removedReleaseIds).toEqual(['r1', 'r2']);
    expect(result.diskErrors).toEqual([]);
    expect(mockManagedAppUpdateOne).toHaveBeenCalledWith(
      { _id: 'app-id-1' },
      { $pull: { releases: { id: { $in: ['r1', 'r2'] } } } }
    );
    for (const id of ['r1', 'r2']) {
      await expect(stat(path.join(appsRoot, 'demo-app', 'releases', id))).rejects.toThrow();
    }
    for (const id of ['r3', 'r4']) {
      await expect(stat(path.join(appsRoot, 'demo-app', 'releases', id))).resolves.toBeTruthy();
    }
  });

  it('never removes the current release, active releases, or operation targets', async () => {
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const appsRoot = await createReleaseDirs('demo-app', ids);
    const app = makeApp({
      currentReleaseId: 'r5',
      releases: [
        release('r1', 1),
        release('r2', 2),
        release('r3', 3, 'active'),
        release('r4', 4),
        release('r5', 5, 'active'),
      ],
    });
    mockAppOperationFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([{ targetReleaseId: 'r1' }, { releaseId: 'r2' }]),
      }),
    });

    const result = await pruneAppReleases(app, { retention: 1, appsRoot });

    expect(result.removedReleaseIds).toEqual(['r4']);
    expect(mockManagedAppUpdateOne).toHaveBeenCalledWith(
      { _id: 'app-id-1' },
      { $pull: { releases: { id: { $in: ['r4'] } } } }
    );
    await expect(stat(path.join(appsRoot, 'demo-app', 'releases', 'r1'))).resolves.toBeTruthy();
    await expect(stat(path.join(appsRoot, 'demo-app', 'releases', 'r2'))).resolves.toBeTruthy();
  });

  it('skips pruning entirely when active operations cannot be verified', async () => {
    const appsRoot = await createReleaseDirs('demo-app', ['r1', 'r2', 'r3']);
    const app = makeApp({
      releases: [release('r1', 1), release('r2', 2), release('r3', 3)],
    });
    mockAppOperationFind.mockImplementation(() => {
      throw new Error('db unavailable');
    });

    const result = await pruneAppReleases(app, { retention: 1, appsRoot });

    expect(result).toEqual({ removedReleaseIds: [], diskErrors: [] });
    expect(mockManagedAppUpdateOne).not.toHaveBeenCalled();
    await expect(stat(path.join(appsRoot, 'demo-app', 'releases', 'r1'))).resolves.toBeTruthy();
  });

  it('reports disk removal failures without failing the prune', async () => {
    const appsRoot = await mkdtemp(path.join(os.tmpdir(), 'servermon-releases-'));
    tempDirs.push(appsRoot);
    const app = makeApp({
      currentReleaseId: 'r3',
      releases: [release('r1', 1), release('r2', 2), release('r3', 3, 'active')],
    });
    // Make the releases directory path a regular file so removal of release
    // directories fails with ENOTDIR.
    await mkdir(path.join(appsRoot, 'demo-app'), { recursive: true });
    await writeFile(path.join(appsRoot, 'demo-app', 'releases'), 'not a directory', 'utf8');

    const result = await pruneAppReleases(app, { retention: 1, appsRoot });

    expect(result.removedReleaseIds).toEqual(['r1', 'r2']);
    expect(result.diskErrors).toEqual([
      { releaseId: 'r1', message: expect.stringMatching(/ENOTDIR/) },
      { releaseId: 'r2', message: expect.stringMatching(/ENOTDIR/) },
    ]);
  });

  it('returns an empty result when the app document is unusable', async () => {
    const result = await pruneAppReleases(
      makeApp({ slug: undefined as unknown as string }),
      { retention: 1 }
    );
    expect(result.removedReleaseIds).toEqual([]);
  });
});

describe('pruneAllAppReleases', () => {
  it('prunes only apps exceeding the configured retention', async () => {
    mockAppsSettingsFindById.mockReturnValue({
      lean: () => Promise.resolve({ releaseRetention: 2 }),
    });
    const bigApp = makeApp({
      releases: [release('a1', 1), release('a2', 2), release('a3', 3, 'active')],
    });
    const smallApp = makeApp({ releases: [release('b1', 1, 'active')] });
    mockManagedAppFind.mockReturnValue({ lean: () => Promise.resolve([bigApp, smallApp]) });
    mockManagedAppUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockAppOperationFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([]) }),
    });

    const result = await pruneAllAppReleases();

    expect(result.appsPruned).toBe(1);
    expect(mockManagedAppUpdateOne).toHaveBeenCalledWith(
      { _id: 'app-id-1' },
      { $pull: { releases: { id: { $in: ['a1'] } } } }
    );
  });

  it('returns zero when the app lookup fails', async () => {
    mockAppsSettingsFindById.mockReturnValue({
      lean: () => Promise.resolve({ releaseRetention: 2 }),
    });
    mockManagedAppFind.mockImplementation(() => {
      throw new Error('db unavailable');
    });
    const result = await pruneAllAppReleases();
    expect(result).toEqual({ appsPruned: 0 });
  });
});
