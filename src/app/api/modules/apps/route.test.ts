/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockListManagedApps, mockCreateManagedApp } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockListManagedApps: vi.fn(),
  mockCreateManagedApp: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/apps/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apps/service')>();
  return {
    ...actual,
    listManagedApps: mockListManagedApps,
    createManagedApp: mockCreateManagedApp,
  };
});
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, POST } from './route';

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost/api/modules/apps', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('/api/modules/apps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when listing apps without an admin session', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('lists managed apps for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockListManagedApps.mockResolvedValue([{ id: 'app-1', name: 'LifeOS' }]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.apps).toEqual([{ id: 'app-1', name: 'LifeOS' }]);
  });

  it('returns 400 for invalid create requests', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await POST(makeRequest({ name: 'LifeOS' }));

    expect(res.status).toBe(400);
    expect(mockCreateManagedApp).not.toHaveBeenCalled();
  });

  it('creates a managed app for valid admin requests', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockCreateManagedApp.mockResolvedValue({ id: 'app-1', name: 'LifeOS' });

    const res = await POST(
      makeRequest({
        name: 'LifeOS',
        sourcePath: '/srv/lifeos',
        domain: 'life.manthanby.cv',
        port: 3010,
        commands: {
          install: 'pnpm install',
          build: 'pnpm build',
          start: 'pnpm start',
        },
      })
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ app: { id: 'app-1', name: 'LifeOS' } });
  });
});
