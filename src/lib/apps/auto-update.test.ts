/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ default: vi.fn() }));
vi.mock('@/models/ManagedApp', () => ({
  default: { find: mocks.find, countDocuments: mocks.count, updateOne: mocks.update },
}));
vi.mock('@/models/AppOperation', () => ({
  default: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) },
}));
vi.mock('./application/enqueue-operation', async (original) => ({
  ...(await original<typeof import('./application/enqueue-operation')>()),
  enqueueAppOperation: mocks.enqueue,
}));
import { countDueGitAppAutoUpdates, runDueGitAppAutoUpdates } from './auto-update';
import { ActiveAppOperationError } from './repositories/operation-repository';
import { AppsWorkerUnavailableError } from './application/enqueue-operation';

describe('durable automatic scheduling', () => {
  const now = new Date('2026-09-06T12:00:00Z');
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ matchedCount: 1 });
  });
  function apps(ids: string[]) {
    mocks.find.mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: async () =>
            ids.map((_id) => ({
              _id,
              autoUpdate: { enabled: true, scheduleGeneration: 2, nextRunAt: now },
            })),
        }),
      }),
    });
  }
  it('includes missing and null legacy deadlines', async () => {
    mocks.count.mockResolvedValue(2);
    expect(await countDueGitAppAutoUpdates(now)).toBe(2);
    expect(mocks.count).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [{ 'autoUpdate.nextRunAt': null }, { 'autoUpdate.nextRunAt': { $lte: now } }],
      })
    );
  });
  it('queues one stable occurrence and only records its id against the same deadline', async () => {
    apps(['a']);
    mocks.enqueue.mockResolvedValue({ operation: { id: 'op_a' } });
    expect(await runDueGitAppAutoUpdates(now)).toEqual({
      checked: 1,
      queued: 1,
      busy: 0,
      blocked: 0,
      failedToQueue: 0,
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'auto',
        idempotencyKey: 'auto:a:2:2026-09-06T12:00:00.000Z',
      })
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ 'autoUpdate.nextRunAt': now, 'autoUpdate.scheduleGeneration': 2 }),
      expect.any(Object)
    );
  });
  it('defers busy and unavailable apps without recording attempts or advancing deadlines', async () => {
    apps(['a', 'b', 'c']);
    mocks.enqueue
      .mockRejectedValueOnce(new ActiveAppOperationError('a'))
      .mockRejectedValueOnce(new AppsWorkerUnavailableError('missing'))
      .mockRejectedValueOnce(new Error('database error'));
    expect(await runDueGitAppAutoUpdates(now)).toEqual({
      checked: 3,
      queued: 0,
      busy: 1,
      blocked: 1,
      failedToQueue: 1,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
