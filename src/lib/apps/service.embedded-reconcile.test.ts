/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockManagedAppFind, mockManagedAppUpdateOne, mockAppOperationFind } = vi.hoisted(() => ({
  mockManagedAppFind: vi.fn(),
  mockManagedAppUpdateOne: vi.fn(),
  mockAppOperationFind: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn() }));
vi.mock('@/models/ManagedApp', () => ({
  default: {
    find: mockManagedAppFind,
    updateOne: mockManagedAppUpdateOne,
  },
}));
vi.mock('@/models/AppOperation', () => ({
  default: {
    find: mockAppOperationFind,
  },
}));
vi.mock('./releases', () => ({ pruneAppReleases: vi.fn() }));
vi.mock('./deploy', async () => {
  const actual = await vi.importActual<typeof import('./deploy')>('./deploy');
  return {
    ...actual,
    deployNextJsApp: vi.fn(),
  };
});
vi.mock('./git', async () => {
  const actual = await vi.importActual<typeof import('./git')>('./git');
  return {
    ...actual,
    prepareGitSourceForDeploy: vi.fn(),
  };
});

import { reconcileStaleEmbeddedAppOperations } from './service';

const now = new Date('2026-11-22T02:00:00.000Z');

function mirrorOperation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deploy-1',
    type: 'deploy',
    status: 'running',
    queueOperationId: 'op_1',
    startedAt: new Date('2026-11-22T01:27:43.942Z'),
    ...overrides,
  };
}

describe('reconcileStaleEmbeddedAppOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockManagedAppUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  it('finalizes a running mirror whose queue record is already terminal', async () => {
    mockManagedAppFind.mockReturnValue({
      lean: () => Promise.resolve([{ _id: 'app-1', operations: [mirrorOperation()] }]),
    });
    mockAppOperationFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            operationId: 'op_1',
            status: 'failed',
            completedAt: new Date('2026-11-22T01:47:39.277Z'),
            error: {
              code: 'WORKER_INTERRUPTED',
              message: 'Apps worker stopped before operation completed',
            },
          },
        ]),
    });

    const result = await reconcileStaleEmbeddedAppOperations({ now });

    expect(result).toEqual({ matched: 1, modified: 1 });
    expect(mockAppOperationFind).toHaveBeenCalledWith(
      { operationId: { $in: ['op_1'] } },
      { operationId: 1, status: 1, completedAt: 1, error: 1, releaseId: 1, commitSha: 1 }
    );
    expect(mockManagedAppUpdateOne).toHaveBeenCalledWith(
      { _id: 'app-1', operations: { $elemMatch: { id: 'deploy-1', status: 'running' } } },
      {
        $set: {
          'operations.$.status': 'failed',
          'operations.$.step': 'Deployment failed',
          'operations.$.completedAt': new Date('2026-11-22T01:47:39.277Z'),
          'operations.$.error': 'Apps worker stopped before operation completed',
        },
      }
    );
  });

  it('leaves the mirror running while its queue record is still active', async () => {
    mockManagedAppFind.mockReturnValue({
      lean: () => Promise.resolve([{ _id: 'app-1', operations: [mirrorOperation()] }]),
    });
    mockAppOperationFind.mockReturnValue({
      lean: () => Promise.resolve([{ operationId: 'op_1', status: 'running', completedAt: null }]),
    });

    const result = await reconcileStaleEmbeddedAppOperations({ now });

    expect(result).toEqual({ matched: 0, modified: 0 });
    expect(mockManagedAppUpdateOne).not.toHaveBeenCalled();
  });

  it('leaves the mirror running when its queue record is missing', async () => {
    mockManagedAppFind.mockReturnValue({
      lean: () => Promise.resolve([{ _id: 'app-1', operations: [mirrorOperation()] }]),
    });
    mockAppOperationFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await reconcileStaleEmbeddedAppOperations({ now });

    expect(result).toEqual({ matched: 0, modified: 0 });
    expect(mockManagedAppUpdateOne).not.toHaveBeenCalled();
  });

  it('does not query queue records without a running mirror', async () => {
    mockManagedAppFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            _id: 'app-1',
            operations: [mirrorOperation({ status: 'succeeded', queueOperationId: 'op_1' })],
          },
        ]),
    });

    const result = await reconcileStaleEmbeddedAppOperations({ now });

    expect(result).toEqual({ matched: 0, modified: 0 });
    expect(mockAppOperationFind).not.toHaveBeenCalled();
    expect(mockManagedAppUpdateOne).not.toHaveBeenCalled();
  });

  it('mirrors a terminal succeeded record with a type-specific step', async () => {
    mockManagedAppFind.mockReturnValue({
      lean: () =>
        Promise.resolve([{ _id: 'app-1', operations: [mirrorOperation({ type: 'update' })] }]),
    });
    mockAppOperationFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            operationId: 'op_1',
            status: 'succeeded',
            completedAt: new Date('2026-11-22T01:50:37.882Z'),
            releaseId: '20261122-014839-101',
            commitSha: 'd30c9e6f9be2b580fd2ebc2e6bbc0ae8c84282df',
          },
        ]),
    });

    const result = await reconcileStaleEmbeddedAppOperations({ now });

    expect(result).toEqual({ matched: 1, modified: 1 });
    expect(mockManagedAppUpdateOne).toHaveBeenCalledWith(expect.anything(), {
      $set: {
        'operations.$.status': 'succeeded',
        'operations.$.step': 'Update deployed',
        'operations.$.completedAt': new Date('2026-11-22T01:50:37.882Z'),
        'operations.$.releaseId': '20261122-014839-101',
        'operations.$.commitSha': 'd30c9e6f9be2b580fd2ebc2e6bbc0ae8c84282df',
      },
    });
  });
});
