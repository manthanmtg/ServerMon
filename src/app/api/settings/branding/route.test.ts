/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

function makeRawRequest(body: string): Request {
  return new Request('http://localhost/api/settings/branding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

describe('GET /api/settings/branding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SERVERMON_BRANDING_MOCK;
  });

  afterEach(() => {
    delete process.env.SERVERMON_BRANDING_MOCK;
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

  it('returns 500 when connectDB rejects', async () => {
    mockConnectDB.mockRejectedValueOnce(new Error('connect failed'));
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch settings');
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns default settings without DB access when branding mock is enabled', async () => {
    process.env.SERVERMON_BRANDING_MOCK = '1';

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ pageTitle: 'ServerMon', logoBase64: '' });
    expect(mockConnectDB).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings/branding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SERVERMON_BRANDING_MOCK;
  });

  afterEach(() => {
    delete process.env.SERVERMON_BRANDING_MOCK;
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

  it('returns 400 for malformed JSON without writing settings', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await POST(makeRawRequest('{bad json'));

    expect(res.status).toBe(400);
    expect(mockConnectDB).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
  });

  it('returns 400 for invalid branding payload fields', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });

    const res = await POST(makeRequest({ pageTitle: { text: 'ServerMon' }, logoBase64: 123 }));

    expect(res.status).toBe(400);
    expect(mockConnectDB).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
  });

  it('returns 500 on DB error', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindOneAndUpdate.mockRejectedValue(new Error('db error'));
    const res = await POST(makeRequest({ pageTitle: 'Test' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to update settings');
  });

  it('returns 500 when session lookup fails', async () => {
    mockGetSession.mockRejectedValue(new Error('session service down'));
    const res = await POST(makeRequest({ pageTitle: 'Test' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to update settings');
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 500 when connectDB rejects', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockConnectDB.mockRejectedValue(new Error('connect failed'));
    const res = await POST(makeRequest({ pageTitle: 'Test' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to update settings');
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('defaults missing fields when payload omits them', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const updated = { pageTitle: 'ServerMon', logoBase64: '' };
    mockFindOneAndUpdate.mockResolvedValue(updated);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, settings: updated });
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({ pageTitle: 'ServerMon', logoBase64: '' }),
      }),
      expect.anything()
    );
  });

  it('returns 400 for null JSON payload', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const res = await POST(makeRawRequest('null'));
    expect(res.status).toBe(400);
    expect(mockConnectDB).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
  });
});
