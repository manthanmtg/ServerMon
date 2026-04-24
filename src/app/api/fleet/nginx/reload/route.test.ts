/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockNginxFindOne, mockNginxTest, mockNginxReload, mockFleetLogCreate } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockNginxFindOne: vi.fn(),
    mockNginxTest: vi.fn(),
    mockNginxReload: vi.fn(),
    mockFleetLogCreate: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/NginxState', () => ({
  default: { findOne: mockNginxFindOne },
}));
vi.mock('@/models/FleetLogEvent', () => ({
  default: { create: mockFleetLogCreate },
}));
vi.mock('@/lib/fleet/nginxProcess', () => ({
  nginxTest: mockNginxTest,
  nginxReload: mockNginxReload,
}));

import { POST } from './route';

function buildStateDoc(over: Record<string, unknown> = {}) {
  const data = {
    key: 'global',
    managed: true,
    ...over,
  };
  const save = vi.fn().mockResolvedValue(undefined);
  const doc: Record<string, unknown> & { save: typeof save } = {
    ...data,
    save,
  };
  return doc;
}

describe('POST /api/fleet/nginx/reload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
    mockFleetLogCreate.mockResolvedValue({});
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 409 when nginx not managed', async () => {
    mockNginxFindOne.mockResolvedValue(buildStateDoc({ managed: false }));
    const res = await POST();
    expect(res.status).toBe(409);
  });

  it('returns 409 if nginx test fails (does not reload)', async () => {
    const doc = buildStateDoc();
    mockNginxFindOne.mockResolvedValue(doc);
    mockNginxTest.mockResolvedValue({ ok: false, stderr: 'bad config' });

    const res = await POST();
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.stderr).toBe('bad config');
    expect(mockNginxReload).not.toHaveBeenCalled();
    expect(doc.lastTestSuccess).toBe(false);
    expect(doc.save).toHaveBeenCalled();
  });

  it('runs reload after successful test, records audit', async () => {
    const doc = buildStateDoc();
    mockNginxFindOne.mockResolvedValue(doc);
    mockNginxTest.mockResolvedValue({ ok: true, stderr: '' });
    mockNginxReload.mockResolvedValue({ ok: true, stderr: '' });

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockNginxReload).toHaveBeenCalled();
    expect(doc.lastReloadSuccess).toBe(true);
    expect(doc.lastReloadAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
    expect(mockFleetLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'nginx.reload', audit: true })
    );
  });

  it('returns 500 on unexpected error', async () => {
    mockNginxFindOne.mockRejectedValue(new Error('db'));
    const res = await POST();
    expect(res.status).toBe(500);
  });
});
