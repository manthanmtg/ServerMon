/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreate, mockFind, mockFindOneAndUpdate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFind: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
}));

vi.mock('@/models/AppOperation', () => ({
  default: {
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));

vi.mock('@/models/AppOperationEvent', () => ({
  default: {
    create: mockCreate,
    find: mockFind,
  },
}));

import { appendAppOperationEvent, listAppOperationEvents } from './operation-event-repository';

describe('operation event repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments operation event sequence before creating an event', async () => {
    mockFindOneAndUpdate.mockResolvedValue({ nextEventSequence: 3 });
    mockCreate.mockResolvedValue({
      operationId: 'op_1',
      appId: 'app-1',
      sequence: 3,
      type: 'progress',
      message: 'Build started',
      createdAt: new Date('2026-07-31T05:00:00.000Z'),
    });

    const event = await appendAppOperationEvent({
      operationId: 'op_1',
      appId: 'app-1',
      type: 'progress',
      message: 'Build started',
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { operationId: 'op_1' },
      { $inc: { nextEventSequence: 1 } },
      { new: true, projection: { nextEventSequence: 1 }, lean: true }
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op_1',
        sequence: 3,
        message: 'Build started',
      })
    );
    expect(event).toEqual({
      operationId: 'op_1',
      appId: 'app-1',
      sequence: 3,
      type: 'progress',
      message: 'Build started',
      createdAt: '2026-07-31T05:00:00.000Z',
    });
  });

  it('redacts details and message before creating an event', async () => {
    mockFindOneAndUpdate.mockResolvedValue({ nextEventSequence: 1 });
    mockCreate.mockImplementation(async (input) => ({
      ...input,
      createdAt: new Date('2026-07-31T05:00:00.000Z'),
    }));

    await appendAppOperationEvent({
      operationId: 'op_1',
      appId: 'app-1',
      type: 'log',
      message: 'TOKEN=abc pnpm build',
      details: { password: 'pw', safe: true },
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'TOKEN=[redacted] pnpm build',
        details: { password: '[redacted]', safe: true },
      })
    );
  });

  it('throws when the operation cannot be sequenced', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);

    await expect(
      appendAppOperationEvent({
        operationId: 'missing',
        appId: 'app-1',
        type: 'progress',
        message: 'Queued',
      })
    ).rejects.toThrow('App operation not found');
  });

  it('lists events after a sequence in ascending order', async () => {
    const sort = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue([
      {
        operationId: 'op_1',
        appId: 'app-1',
        sequence: 2,
        type: 'progress',
        message: 'Running',
        createdAt: new Date('2026-07-31T05:01:00.000Z'),
      },
    ]);
    mockFind.mockReturnValue({ sort, limit });

    const events = await listAppOperationEvents('op_1', { afterSequence: 1, limit: 10 });

    expect(mockFind).toHaveBeenCalledWith({ operationId: 'op_1', sequence: { $gt: 1 } });
    expect(sort).toHaveBeenCalledWith({ sequence: 1 });
    expect(limit).toHaveBeenCalledWith(10);
    expect(events).toEqual([
      {
        operationId: 'op_1',
        appId: 'app-1',
        sequence: 2,
        type: 'progress',
        message: 'Running',
        createdAt: '2026-07-31T05:01:00.000Z',
      },
    ]);
  });
});
