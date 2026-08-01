/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockConnectDB,
  mockFindById,
  mockCreateAppOperationRecord,
  mockFindAppOperationByIdempotencyKey,
  mockGetAppsWorkerAvailability,
} = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockFindById: vi.fn(),
  mockCreateAppOperationRecord: vi.fn(),
  mockFindAppOperationByIdempotencyKey: vi.fn(),
  mockGetAppsWorkerAvailability: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  default: mockConnectDB,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/models/ManagedApp', () => ({
  default: {
    findById: mockFindById,
  },
}));

vi.mock('../repositories/operation-repository', async () => {
  const actual = await vi.importActual<typeof import('../repositories/operation-repository')>(
    '../repositories/operation-repository'
  );
  return {
    ...actual,
    createAppOperationRecord: mockCreateAppOperationRecord,
    findAppOperationByIdempotencyKey: mockFindAppOperationByIdempotencyKey,
  };
});

vi.mock('../repositories/worker-heartbeat-repository', () => ({
  getAppsWorkerAvailability: mockGetAppsWorkerAvailability,
}));

import { ActiveAppOperationError } from '../repositories/operation-repository';
import { AppsWorkerUnavailableError, enqueueAppOperation } from './enqueue-operation';

const appId = '64f000000000000000000001';

function appRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => appId },
    name: 'Demo',
    slug: 'demo',
    templateId: 'nextjs',
    sourceType: 'git',
    sourcePath: undefined,
    gitUrl: 'https://example.test/repo.git',
    gitBranch: 'main',
    domain: 'demo.example.test',
    port: 3001,
    commands: { install: 'pnpm install', build: 'pnpm build', start: 'pnpm start' },
    envVars: new Map([['JWT_SECRET', 'secret']]),
    healthCheckPath: '/',
    tlsEnabled: true,
    configVersion: 4,
    executionEngine: 'legacy',
    currentReleaseId: 'release-1',
    ...overrides,
  };
}

function findByIdLean(value: unknown) {
  mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(value) });
}

describe('enqueueAppOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockFindAppOperationByIdempotencyKey.mockResolvedValue(null);
    mockGetAppsWorkerAvailability.mockResolvedValue({
      available: true,
      reason: 'healthy',
      workerId: 'worker-1',
    });
    mockCreateAppOperationRecord.mockResolvedValue({
      id: 'op_1',
      appId,
      type: 'deploy',
      status: 'queued',
      phase: 'queued',
      createdAt: '2026-07-31T05:00:00.000Z',
    });
  });

  it('snapshots app configuration without environment values', async () => {
    findByIdLean(appRecord());

    const result = await enqueueAppOperation({
      appId,
      type: 'deploy',
      idempotencyKey: 'idem-1',
      requestedBy: { role: 'admin' },
      operationIdFactory: () => 'op_1',
    });

    expect(mockCreateAppOperationRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'op_1',
        appId,
        appSlug: 'demo',
        type: 'deploy',
        idempotencyKey: 'idem-1',
        configSnapshot: expect.not.objectContaining({ envVars: expect.anything() }),
      })
    );
    expect(mockCreateAppOperationRecord.mock.calls[0][0].configSnapshot).toMatchObject({
      name: 'Demo',
      slug: 'demo',
      templateId: 'nextjs',
      sourceType: 'git',
      gitUrl: 'https://example.test/repo.git',
      gitBranch: 'main',
      domain: 'demo.example.test',
      port: 3001,
      healthCheckPath: '/',
      tlsEnabled: true,
      configVersion: 4,
      executionEngine: 'legacy',
    });
    expect(result).toEqual({
      operation: {
        id: 'op_1',
        appId,
        type: 'deploy',
        status: 'queued',
        phase: 'queued',
        createdAt: '2026-07-31T05:00:00.000Z',
      },
      links: {
        self: '/api/modules/apps/operations/op_1',
        events: '/api/modules/apps/operations/op_1/events',
        cancel: '/api/modules/apps/operations/op_1/cancel',
      },
    });
  });

  it('returns the existing operation for a matching idempotency key', async () => {
    mockFindAppOperationByIdempotencyKey.mockResolvedValue({
      id: 'op_existing',
      appId,
      type: 'update',
      status: 'queued',
      phase: 'queued',
      createdAt: '2026-07-31T05:00:00.000Z',
    });

    const result = await enqueueAppOperation({
      appId,
      type: 'update',
      idempotencyKey: 'idem-1',
    });

    expect(mockFindAppOperationByIdempotencyKey).toHaveBeenCalledWith(appId, 'idem-1');
    expect(mockFindById).not.toHaveBeenCalled();
    expect(mockGetAppsWorkerAvailability).not.toHaveBeenCalled();
    expect(mockCreateAppOperationRecord).not.toHaveBeenCalled();
    expect(result.operation.id).toBe('op_existing');
  });

  it('rejects update operations for non-git apps', async () => {
    findByIdLean(appRecord({ sourceType: 'local', gitUrl: undefined, gitBranch: undefined }));

    await expect(enqueueAppOperation({ appId, type: 'update' })).rejects.toThrow(
      'Only git apps can be updated'
    );
    expect(mockGetAppsWorkerAvailability).not.toHaveBeenCalled();
    expect(mockCreateAppOperationRecord).not.toHaveBeenCalled();
  });

  it('requires a rollback target release id', async () => {
    findByIdLean(appRecord());

    await expect(enqueueAppOperation({ appId, type: 'rollback' })).rejects.toThrow(
      'Rollback target release is required'
    );
    expect(mockGetAppsWorkerAvailability).not.toHaveBeenCalled();
    expect(mockCreateAppOperationRecord).not.toHaveBeenCalled();
  });

  it('rejects new work without creating a record when the worker is unavailable', async () => {
    findByIdLean(appRecord());
    mockGetAppsWorkerAvailability.mockResolvedValue({
      available: false,
      reason: 'stale',
      workerId: 'worker-1',
    });

    await expect(enqueueAppOperation({ appId, type: 'update' })).rejects.toBeInstanceOf(
      AppsWorkerUnavailableError
    );
    expect(mockCreateAppOperationRecord).not.toHaveBeenCalled();
  });

  it('surfaces active operation conflicts', async () => {
    findByIdLean(appRecord());
    mockCreateAppOperationRecord.mockRejectedValue(new ActiveAppOperationError(appId));

    await expect(enqueueAppOperation({ appId, type: 'deploy' })).rejects.toBeInstanceOf(
      ActiveAppOperationError
    );
  });
});
