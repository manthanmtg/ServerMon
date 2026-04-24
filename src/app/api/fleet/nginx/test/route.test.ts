/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockNginxFindOne, mockNginxTest } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockNginxFindOne: vi.fn(),
  mockNginxTest: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/NginxState', () => ({
  default: { findOne: mockNginxFindOne },
}));
vi.mock('@/lib/fleet/nginxProcess', () => ({
  nginxTest: mockNginxTest,
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

describe('POST /api/fleet/nginx/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
  });

  it('returns 401 without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 409 when nginx is not managed', async () => {
    mockNginxFindOne.mockResolvedValue(buildStateDoc({ managed: false }));
    const res = await POST();
    expect(res.status).toBe(409);
  });

  it('returns 409 when NginxState missing', async () => {
    mockNginxFindOne.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(409);
  });

  it('runs nginx -t, updates state, returns ok:true', async () => {
    const doc = buildStateDoc();
    mockNginxFindOne.mockResolvedValue(doc);
    mockNginxTest.mockResolvedValue({ ok: true, stderr: 'ok' });

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.stderr).toBe('ok');
    expect(doc.lastTestAt).toBeInstanceOf(Date);
    expect(doc.lastTestSuccess).toBe(true);
    expect(doc.lastTestOutput).toBe('ok');
    expect(doc.save).toHaveBeenCalled();
  });

  it('records failed test in state when nginxTest returns ok:false', async () => {
    const doc = buildStateDoc();
    mockNginxFindOne.mockResolvedValue(doc);
    mockNginxTest.mockResolvedValue({ ok: false, stderr: 'syntax error' });

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.stderr).toBe('syntax error');
    expect(doc.lastTestSuccess).toBe(false);
    expect(doc.lastTestOutput).toBe('syntax error');
  });

  it('returns 500 on unexpected error', async () => {
    mockNginxFindOne.mockRejectedValue(new Error('db down'));
    const res = await POST();
    expect(res.status).toBe(500);
  });
});
