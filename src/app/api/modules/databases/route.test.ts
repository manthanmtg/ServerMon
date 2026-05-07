/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSession, mockListDatabases, mockCreateDatabase } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockListDatabases: vi.fn(),
  mockCreateDatabase: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/databases/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/databases/service')>();
  return {
    ...actual,
    listManagedDatabases: mockListDatabases,
    createManagedDatabase: mockCreateDatabase,
  };
});
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, POST } from './route';

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost/api/modules/databases', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('/api/modules/databases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires admin access to list databases', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('lists databases for admins', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockListDatabases.mockResolvedValue([{ id: 'db-1', name: 'Main Postgres' }]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.databases).toEqual([{ id: 'db-1', name: 'Main Postgres' }]);
  });

  it('validates create requests before calling the service', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await POST(makeRequest({ name: 'Missing Fields' }));

    expect(res.status).toBe(400);
    expect(mockCreateDatabase).not.toHaveBeenCalled();
  });

  it('creates a database for valid admin requests', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockCreateDatabase.mockResolvedValue({ id: 'db-1', name: 'Main Postgres' });

    const res = await POST(
      makeRequest({
        name: 'Main Postgres',
        templateId: 'postgres',
        version: '17',
        port: 5432,
        username: 'servermon',
        password: 'pg-pass-1',
        databaseName: 'servermon',
        publicRoute: false,
        sslMode: 'disable',
      })
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      database: { id: 'db-1', name: 'Main Postgres' },
    });
  });
});
