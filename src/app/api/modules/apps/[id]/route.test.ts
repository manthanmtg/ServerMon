/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockDeleteManagedApp, mockUpdateManagedApp } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockDeleteManagedApp: vi.fn(),
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

  it('deletes a managed app for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockDeleteManagedApp.mockResolvedValue({ id: 'app-1', logs: ['Removed managed app root'] });

    const res = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'app-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockDeleteManagedApp).toHaveBeenCalledWith('app-1');
    await expect(res.json()).resolves.toEqual({
      deletion: { id: 'app-1', logs: ['Removed managed app root'] },
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
