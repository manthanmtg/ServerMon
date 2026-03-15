/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockConnectDB,
  mockSessionFind,
  mockSessionCreate,
  mockSessionCountDocuments,
  mockSessionFindOneAndUpdate,
  mockSessionDeleteOne,
  mockSessionDeleteMany,
  mockHistoryFindOne,
  mockGetSession,
  mockTerminalSettingsFindById,
} = vi.hoisted(() => ({
  mockConnectDB: vi.fn().mockResolvedValue(undefined),
  mockSessionFind: vi.fn(),
  mockSessionCreate: vi.fn(),
  mockSessionCountDocuments: vi.fn(),
  mockSessionFindOneAndUpdate: vi.fn(),
  mockSessionDeleteOne: vi.fn(),
  mockSessionDeleteMany: vi.fn(),
  mockHistoryFindOne: vi.fn(),
  mockGetSession: vi.fn(),
  mockTerminalSettingsFindById: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/TerminalSession', () => ({
  default: {
    find: mockSessionFind,
    create: mockSessionCreate,
    countDocuments: mockSessionCountDocuments,
    findOneAndUpdate: mockSessionFindOneAndUpdate,
    deleteOne: mockSessionDeleteOne,
    deleteMany: mockSessionDeleteMany,
  },
}));
vi.mock('@/models/TerminalHistory', () => ({
  default: { findOne: mockHistoryFindOne },
}));
vi.mock('@/models/TerminalSettings', () => ({
  default: { findById: mockTerminalSettingsFindById },
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, POST, PUT, DELETE } from './route';

describe('GET /api/terminal/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sessions list', async () => {
    const sessions = [{ sessionId: 'sess-1', label: 'Terminal 1' }];
    mockSessionFind.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(sessions) }) });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
  });

  it('returns empty sessions', async () => {
    mockSessionFind.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([]) }) });
    const res = await GET();
    const json = await res.json();
    expect(json.sessions).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockSessionFind.mockReturnValue({
      sort: () => ({ lean: () => Promise.reject(new Error('db error')) }),
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe('POST /api/terminal/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new session', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockTerminalSettingsFindById.mockReturnValue({
      lean: () => Promise.resolve({ maxSessions: 8 }),
    });
    mockSessionCountDocuments.mockResolvedValue(0);
    const session = { sessionId: 'new-sess', label: 'Terminal 1' };
    mockSessionCreate.mockResolvedValue(session);
    const res = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ label: 'Terminal 1' }),
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.session).toBeDefined();
  });

  it('returns 400 when max sessions reached', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockTerminalSettingsFindById.mockReturnValue({
      lean: () => Promise.resolve({ maxSessions: 8 }),
    });
    mockSessionCountDocuments.mockResolvedValue(8);
    const res = await POST(new Request('http://localhost', { method: 'POST' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Maximum');
  });

  it('uses default maxSessions of 8 when settings not found', async () => {
    mockGetSession.mockResolvedValue(null);
    mockTerminalSettingsFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockSessionCountDocuments.mockResolvedValue(9);
    const res = await POST(new Request('http://localhost', { method: 'POST' }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/terminal/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when sessionId missing', async () => {
    const res = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('sessionId required');
  });

  it('updates session label', async () => {
    const updated = { sessionId: 'sess-1', label: 'New Label' };
    mockSessionFindOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(updated) });
    const res = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'sess-1', label: 'New Label' }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.session.label).toBe('New Label');
  });

  it('returns 404 when session not found', async () => {
    mockSessionFindOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(null) });
    const res = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'missing' }),
      })
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/terminal/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when sessionId missing and no resetAll', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const res = await DELETE(new Request('http://localhost/api/terminal/sessions'));
    expect(res.status).toBe(400);
  });

  it('deletes specific session', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockSessionDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mockHistoryFindOne.mockResolvedValue(null);
    mockSessionCountDocuments.mockResolvedValue(1);
    const res = await DELETE(
      new Request('http://localhost/api/terminal/sessions?sessionId=sess-1')
    );
    expect(res.status).toBe(200);
  });

  it('creates new session when last one deleted', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockSessionDeleteOne.mockResolvedValue({});
    mockHistoryFindOne.mockResolvedValue(null);
    mockSessionCountDocuments.mockResolvedValue(0);
    const newSess = { sessionId: 'new-1', label: 'Terminal 1' };
    mockSessionCreate.mockResolvedValue(newSess);
    const res = await DELETE(
      new Request('http://localhost/api/terminal/sessions?sessionId=sess-1')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.wasLast).toBe(true);
  });

  it('resets all sessions', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockSessionDeleteMany.mockResolvedValue({});
    const newSess = { sessionId: 'new-1', label: 'Terminal 1' };
    mockSessionCreate.mockResolvedValue(newSess);
    const res = await DELETE(new Request('http://localhost/api/terminal/sessions?resetAll=true'));
    expect(res.status).toBe(200);
    expect(mockSessionDeleteMany).toHaveBeenCalled();
  });
});
