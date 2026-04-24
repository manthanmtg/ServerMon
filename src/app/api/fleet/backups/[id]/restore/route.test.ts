/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetSession,
  mockFindById,
  mockFleetLogCreate,
  mockReadFile,
  mockNodeInsertMany,
  mockRouteInsertMany,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFindById: vi.fn(),
  mockFleetLogCreate: vi.fn(),
  mockReadFile: vi.fn(),
  mockNodeInsertMany: vi.fn(),
  mockRouteInsertMany: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: mockReadFile,
  },
  readFile: mockReadFile,
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/audit', () => ({
  recordAudit: (_m: unknown, input: Record<string, unknown>) =>
    mockFleetLogCreate({ ...input, audit: true, eventType: input.action }),
}));

vi.mock('@/models/BackupJob', () => ({
  default: { findById: mockFindById },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));
vi.mock('@/models/Node', () => ({
  default: { insertMany: mockNodeInsertMany },
}));
vi.mock('@/models/PublicRoute', () => ({
  default: { insertMany: mockRouteInsertMany },
}));
vi.mock('@/models/ConfigRevision', () => ({ default: { insertMany: vi.fn() } }));
vi.mock('@/models/NginxState', () => ({ default: { insertMany: vi.fn() } }));
vi.mock('@/models/AccessPolicy', () => ({ default: { insertMany: vi.fn() } }));
vi.mock('@/models/ResourcePolicy', () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock('@/models/RouteTemplate', () => ({
  default: { insertMany: vi.fn() },
}));
vi.mock('@/models/ImportedConfig', () => ({
  default: { insertMany: vi.fn() },
}));

import { POST } from './route';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/fleet/backups/[id]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockNodeInsertMany.mockResolvedValue([]);
    mockRouteInsertMany.mockResolvedValue([]);
  });

  it('401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(new NextRequest('http://localhost'), ctx('b1'));
    expect(res.status).toBe(401);
  });

  it('403 for viewer role', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'v', role: 'user' } });
    const res = await POST(new NextRequest('http://localhost'), ctx('b1'));
    expect(res.status).toBe(403);
  });

  it('403 for operator role (admin-only)', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'op', role: 'operator' } });
    const res = await POST(new NextRequest('http://localhost'), ctx('b1'));
    expect(res.status).toBe(403);
  });

  it('404 when backup missing', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await POST(new NextRequest('http://localhost'), ctx('b1'));
    expect(res.status).toBe(404);
  });

  it('400 when manifestPath missing', async () => {
    mockFindById.mockResolvedValue({ _id: 'b1', save: vi.fn() });
    const res = await POST(new NextRequest('http://localhost'), ctx('b1'));
    expect(res.status).toBe(400);
  });

  it('restores each scope via insertMany and audits', async () => {
    const saveFn = vi.fn();
    mockFindById.mockResolvedValue({
      _id: 'b1',
      manifestPath: '/tmp/backup-b1/manifest.json',
      restoreVerified: false,
      save: saveFn,
    });
    mockReadFile.mockImplementation(async (p: string) => {
      if (p.endsWith('manifest.json')) {
        return JSON.stringify({
          scopes: ['nodes', 'publicRoutes'],
          files: {
            nodes: {
              path: '/tmp/backup-b1/nodes.json',
              count: 1,
              sizeBytes: 10,
            },
            publicRoutes: {
              path: '/tmp/backup-b1/publicRoutes.json',
              count: 1,
              sizeBytes: 10,
            },
          },
        });
      }
      if (p.endsWith('nodes.json')) {
        return JSON.stringify([{ _id: 'n1', slug: 'orion' }]);
      }
      if (p.endsWith('publicRoutes.json')) {
        return JSON.stringify([{ _id: 'r1', domain: 'a.example.com' }]);
      }
      return '[]';
    });

    const res = await POST(new NextRequest('http://localhost'), ctx('b1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.restoreVerified).toBe(true);
    expect(json.restored.nodes).toBe(1);
    expect(json.restored.publicRoutes).toBe(1);
    expect(mockNodeInsertMany).toHaveBeenCalledWith([{ _id: 'n1', slug: 'orion' }], {
      ordered: false,
    });
    expect(mockRouteInsertMany).toHaveBeenCalled();
    expect(saveFn).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'backup.restore' })
    );
  });
});
