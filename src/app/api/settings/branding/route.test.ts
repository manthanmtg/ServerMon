/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnectDB, mockFindById, mockFindOneAndUpdate, mockGetSession } = vi.hoisted(() => ({
  mockConnectDB: vi.fn().mockResolvedValue(undefined),
  mockFindById: vi.fn(),
  mockFindOneAndUpdate: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/BrandSettings', () => ({
  default: {
    findById: mockFindById,
    findOneAndUpdate: mockFindOneAndUpdate,
  },
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, POST } from './route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/settings/branding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/settings/branding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing settings', async () => {
    const settings = { pageTitle: 'MyServer', logoBase64: '' };
    mockFindById.mockReturnValue({ lean: () => Promise.resolve(settings) });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pageTitle).toBe('MyServer');
  });

  it('returns defaults when no settings exist', async () => {
    mockFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pageTitle).toBe('ServerMon');
    expect(json.logoBase64).toBe('');
  });

  it('returns 500 on DB error', async () => {
    mockFindById.mockReturnValue({ lean: () => Promise.reject(new Error('db error')) });
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch settings');
  });
});

describe('POST /api/settings/branding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ pageTitle: 'Test' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when not admin', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });
    const res = await POST(makeRequest({ pageTitle: 'Test' }));
    expect(res.status).toBe(401);
  });

  it('updates branding settings as admin', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const updated = { pageTitle: 'MyMon', logoBase64: 'data:...' };
    mockFindOneAndUpdate.mockResolvedValue(updated);
    const res = await POST(makeRequest({ pageTitle: 'MyMon', logoBase64: 'data:...' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('uses default pageTitle when not provided', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindOneAndUpdate.mockResolvedValue({ pageTitle: 'ServerMon' });
    await POST(makeRequest({}));
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ pageTitle: 'ServerMon' }) }),
      expect.anything()
    );
  });

  it('returns 500 on DB error', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindOneAndUpdate.mockRejectedValue(new Error('db error'));
    const res = await POST(makeRequest({ pageTitle: 'Test' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to update settings');
  });
});
