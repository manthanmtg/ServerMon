/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnectDB, mockGetSession, mockFindById, mockCreate, mockFindByIdAndUpdate } =
  vi.hoisted(() => ({
    mockConnectDB: vi.fn().mockResolvedValue(undefined),
    mockGetSession: vi.fn(),
    mockFindById: vi.fn(),
    mockCreate: vi.fn(),
    mockFindByIdAndUpdate: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/models/TerminalSettings', () => ({
  default: {
    findById: mockFindById,
    create: mockCreate,
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, PUT } from './route';

describe('GET /api/terminal/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns existing settings', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const settings = { _id: 'terminal-settings', fontSize: 14, maxSessions: 8 };
    mockFindById.mockReturnValue({ lean: () => Promise.resolve(settings) });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings.fontSize).toBe(14);
  });

  it('creates default settings when none exist', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const newSettings = { _id: 'terminal-settings', fontSize: 13 };
    mockFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockCreate.mockResolvedValue({ toObject: () => newSettings });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindById.mockReturnValue({ lean: () => Promise.reject(new Error('db error')) });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/terminal/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when not admin', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });
    const res = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    );
    expect(res.status).toBe(403);
  });

  it('updates fontSize within bounds', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const updated = { fontSize: 16, maxSessions: 8 };
    mockFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.resolve(updated) });
    const res = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fontSize: 16 }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings.fontSize).toBe(16);
  });

  it('clamps fontSize to min 10', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.resolve({ fontSize: 10 }) });
    await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fontSize: 5 }),
      })
    );
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ fontSize: 10 }) }),
      expect.anything()
    );
  });

  it('clamps maxSessions to max 20', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.resolve({ maxSessions: 20 }) });
    await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxSessions: 100 }),
      })
    );
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ maxSessions: 20 }) }),
      expect.anything()
    );
  });

  it('returns 500 on DB error', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.reject(new Error('db error')) });
    const res = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    );
    expect(res.status).toBe(500);
  });
});
