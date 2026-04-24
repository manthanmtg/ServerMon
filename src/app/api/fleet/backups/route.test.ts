/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockBackupFind, mockBackupCreate, mockFleetLogCreate, mockWriteSnapshot } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockBackupFind: vi.fn(),
    mockBackupCreate: vi.fn(),
    mockFleetLogCreate: vi.fn(),
    mockWriteSnapshot: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/fleet/audit', () => ({
  recordAudit: (_m: unknown, input: Record<string, unknown>) =>
    mockFleetLogCreate({ ...input, audit: true, eventType: input.action }),
}));
vi.mock('@/lib/fleet/backup', () => ({
  writeBackupSnapshot: mockWriteSnapshot,
}));

vi.mock('@/models/BackupJob', async () => {
  const { BackupJobZodSchema } =
    await vi.importActual<typeof import('@/models/BackupJob')>('@/models/BackupJob');
  return {
    default: { find: mockBackupFind, create: mockBackupCreate },
    BackupJobZodSchema,
  };
});

vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

// Other models still imported by route; provide defaults
vi.mock('@/models/Node', () => ({ default: {} }));
vi.mock('@/models/PublicRoute', () => ({ default: {} }));
vi.mock('@/models/ConfigRevision', () => ({ default: {} }));
vi.mock('@/models/NginxState', () => ({ default: {} }));
vi.mock('@/models/AccessPolicy', () => ({ default: {} }));
vi.mock('@/models/ResourcePolicy', () => ({ default: {} }));
vi.mock('@/models/RouteTemplate', () => ({ default: {} }));
vi.mock('@/models/ImportedConfig', () => ({ default: {} }));

import { GET, POST } from './route';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/backups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/fleet/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
  });

  it('401 without session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/fleet/backups'));
    expect(res.status).toBe(401);
  });

  it('returns list', async () => {
    mockBackupFind.mockReturnValue({
      sort: () => ({
        lean: vi.fn().mockResolvedValue([{ _id: 'b1' }]),
      }),
    });
    const res = await GET(new NextRequest('http://localhost/api/fleet/backups'));
    const json = await res.json();
    expect(json.jobs).toHaveLength(1);
  });
});

describe('POST /api/fleet/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { username: 'admin', role: 'admin' },
    });
    mockFleetLogCreate.mockResolvedValue({});
    mockWriteSnapshot.mockResolvedValue({
      sizeBytes: 500,
      manifestPath: '/tmp/backup-b1/manifest.json',
    });
    mockBackupCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: 'b1',
      save: vi.fn().mockResolvedValue(undefined),
      toObject() {
        return { ...doc, _id: 'b1' };
      },
    }));
  });

  const validBody = {
    type: 'manual' as const,
    scopes: ['nodes' as const],
    destination: { kind: 'local' as const, path: './.fleet-backups' },
  };

  it('rejects invalid body', async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it('creates backup and writes snapshot', async () => {
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(201);
    expect(mockWriteSnapshot).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'backup.create' })
    );
  });

  it('marks status=failed when snapshot errors', async () => {
    mockWriteSnapshot.mockRejectedValue(new Error('disk full'));
    let createdDoc: Record<string, unknown> = {};
    mockBackupCreate.mockImplementation(async (doc: Record<string, unknown>) => {
      createdDoc = { ...doc, _id: 'b1' };
      const proxy = new Proxy(createdDoc, {
        get(target, prop) {
          if (prop === 'save') return vi.fn().mockResolvedValue(undefined);
          if (prop === 'toObject') return () => ({ ...createdDoc });
          return (target as Record<string | symbol, unknown>)[prop];
        },
        set(target, prop, value) {
          (target as Record<string | symbol, unknown>)[prop] = value;
          return true;
        },
      });
      return proxy;
    });
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(201);
    expect(createdDoc.status).toBe('failed');
    expect(String(createdDoc.error)).toContain('disk full');
  });
});
