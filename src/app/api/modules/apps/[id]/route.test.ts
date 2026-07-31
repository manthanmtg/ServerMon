/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockDeleteManagedApp, mockEnqueueAppOperation, mockUpdateManagedApp } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockDeleteManagedApp: vi.fn(),
    mockEnqueueAppOperation: vi.fn(),
    mockUpdateManagedApp: vi.fn(),
  }));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apps/service')>();
  return {
    ...actual,
    deleteManagedApp: mockDeleteManagedApp,
    updateManagedApp: mockUpdateManagedApp,
  };
});
vi.mock('@/lib/apps/application/enqueue-operation', () => ({
  enqueueAppOperation: mockEnqueueAppOperation,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DELETE, PATCH } from './route';

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/modules/apps/app-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/modules/apps/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when deleting without an admin session', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(401);
    expect(mockDeleteManagedApp).not.toHaveBeenCalled();
  });

  it('enqueues managed app deletion for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1', username: 'root', role: 'admin' } });
    mockEnqueueAppOperation.mockResolvedValue({
      operation: {
        id: 'op_1',
        appId: 'app-1',
        type: 'delete',
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

    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(202);
    expect(mockDeleteManagedApp).not.toHaveBeenCalled();
    expect(mockEnqueueAppOperation).toHaveBeenCalledWith({
      appId: 'app-1',
      type: 'delete',
      requestedBy: { userId: 'user-1', username: 'root', role: 'admin' },
    });
    await expect(res.json()).resolves.toEqual({
      deletion: { operationId: 'op_1', status: 'queued', phase: 'queued' },
    });
  });

  it('returns 401 when editing without an admin session', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ name: 'Inventory Portal' }), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(401);
    expect(mockUpdateManagedApp).not.toHaveBeenCalled();
  });

  it('updates a managed app for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockUpdateManagedApp.mockResolvedValue({
      id: 'app-1',
      name: 'Inventory Portal',
      commands: {
        install: 'pnpm install',
        build: 'pnpm build',
        start: 'pnpm start',
      },
    });

    const payload = {
      name: 'Inventory Portal',
      sourceType: 'local',
      sourcePath: '/srv/apps/inventory-portal',
      domain: 'inventory.example.com',
      port: 3010,
      commands: {
        install: 'pnpm install',
        build: 'pnpm build',
        start: 'pnpm start',
      },
      envVars: {},
      healthCheckPath: '/',
      tlsEnabled: false,
      templateId: 'nextjs',
    };
    const res = await PATCH(makePatchRequest(payload), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateManagedApp).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining(payload),
      undefined
    );
    await expect(res.json()).resolves.toEqual({
      app: {
        id: 'app-1',
        name: 'Inventory Portal',
        commands: {
          install: 'pnpm install',
          build: 'pnpm build',
          start: 'pnpm start',
        },
      },
    });
  });
});
