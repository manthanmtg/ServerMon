/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSession, mockNginxFindOne, mockNginxCreate, mockFleetLogCreate } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockNginxFindOne: vi.fn(),
    mockNginxCreate: vi.fn(),
    mockFleetLogCreate: vi.fn(),
  })
);

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/NginxState', () => ({
  default: { findOne: mockNginxFindOne, create: mockNginxCreate },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));

import { GET, POST } from './route';

function buildStateDoc(over: Record<string, unknown> = {}) {
  const data = {
    key: 'global',
    managed: false,
    runtimeState: 'unknown',
    managedServerNames: [],
    detectedConflicts: [],
    ...over,
  };
  const save = vi.fn().mockResolvedValue(undefined);
  const doc: Record<string, unknown> & {
    save: typeof save;
    toObject: () => Record<string, unknown>;
  } = {
    ...data,
    save,
    toObject() {
      return { ...this, save: undefined, toObject: undefined };
    },
  };
  return doc;
}

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fleet/nginx', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/fleet/nginx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns existing singleton', async () => {
    mockNginxFindOne.mockResolvedValue(buildStateDoc({ managed: true }));
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state.managed).toBe(true);
    expect(mockNginxCreate).not.toHaveBeenCalled();
  });

  it('creates singleton when missing', async () => {
    mockNginxFindOne.mockResolvedValue(null);
    mockNginxCreate.mockResolvedValue(buildStateDoc());
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockNginxCreate).toHaveBeenCalled();
  });
});

describe('POST /api/fleet/nginx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', { managed: true }));
    expect(res.status).toBe(401);
  });

  it('rejects invalid body with 400', async () => {
    const res = await POST(makeRequest('POST', { managed: 'not-bool' }));
    expect(res.status).toBe(400);
  });

  it('toggles managed true with paths and records audit', async () => {
    const doc = buildStateDoc();
    mockNginxFindOne.mockResolvedValue(doc);

    const res = await POST(
      makeRequest('POST', {
        managed: true,
        managedDir: '/etc/nginx/servermon',
        binaryPath: '/usr/sbin/nginx',
      })
    );
    expect(res.status).toBe(200);
    expect(doc.managed).toBe(true);
    expect(doc.managedDir).toBe('/etc/nginx/servermon');
    expect(doc.binaryPath).toBe('/usr/sbin/nginx');
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'nginx.toggle_managed', audit: true })
    );
  });

  it('creates singleton on POST when missing', async () => {
    const doc = buildStateDoc();
    mockNginxFindOne.mockResolvedValue(null);
    mockNginxCreate.mockResolvedValue(doc);

    const res = await POST(makeRequest('POST', { managed: false }));
    expect(res.status).toBe(200);
    expect(mockNginxCreate).toHaveBeenCalled();
  });
});
