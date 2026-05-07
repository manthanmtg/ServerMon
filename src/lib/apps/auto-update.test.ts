/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFind, mockUpdateManagedGitApp } = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockUpdateManagedGitApp: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn() }));
vi.mock('@/models/ManagedApp', () => ({ default: { find: mockFind } }));
vi.mock('./service', () => ({ updateManagedGitApp: mockUpdateManagedGitApp }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { runDueGitAppAutoUpdates } from './auto-update';

describe('git app auto update runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates due git apps with auto update enabled', async () => {
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'app-1' }, { _id: 'app-2' }]),
    });
    mockUpdateManagedGitApp.mockResolvedValue({ status: 'unchanged' });

    const result = await runDueGitAppAutoUpdates(new Date('2026-05-07T00:00:00.000Z'));

    expect(mockFind).toHaveBeenCalledWith({
      sourceType: 'git',
      'autoUpdate.enabled': true,
      $or: [
        { 'autoUpdate.nextRunAt': { $exists: false } },
        { 'autoUpdate.nextRunAt': { $lte: new Date('2026-05-07T00:00:00.000Z') } },
      ],
    });
    expect(mockUpdateManagedGitApp).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ checked: 2, updated: 0, unchanged: 2, failed: 0 });
  });

  it('continues when one app update fails', async () => {
    mockFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'app-1' }, { _id: 'app-2' }]),
    });
    mockUpdateManagedGitApp
      .mockResolvedValueOnce({ status: 'active' })
      .mockRejectedValueOnce(new Error('build failed'));

    const result = await runDueGitAppAutoUpdates(new Date('2026-05-07T00:00:00.000Z'));

    expect(result).toEqual({ checked: 2, updated: 1, unchanged: 0, failed: 1 });
  });
});
