/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockConnectDB,
  mockCommandFind,
  mockCommandCreate,
  mockCommandFindByIdAndUpdate,
  mockCommandFindByIdAndDelete,
  mockGetSession,
} = vi.hoisted(() => ({
  mockConnectDB: vi.fn().mockResolvedValue(undefined),
  mockCommandFind: vi.fn(),
  mockCommandCreate: vi.fn(),
  mockCommandFindByIdAndUpdate: vi.fn(),
  mockCommandFindByIdAndDelete: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/SavedCommand', () => ({
  default: {
    find: mockCommandFind,
    create: mockCommandCreate,
    findByIdAndUpdate: mockCommandFindByIdAndUpdate,
    findByIdAndDelete: mockCommandFindByIdAndDelete,
  },
}));
vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, POST, PUT, DELETE } from './route';

const makeReq = (
  method: string,
  body?: Record<string, unknown>,
  url = 'http://localhost/api/terminal/commands'
) =>
  new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

describe('GET /api/terminal/commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns commands list when authenticated', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const commands = [
      { _id: '1', name: 'List Files', command: 'ls -la', category: 'General' },
      { _id: '2', name: 'Disk Usage', command: 'df -h', category: 'System' },
    ];
    mockCommandFind.mockReturnValue({
      sort: () => ({ lean: () => Promise.resolve(commands) }),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.commands).toHaveLength(2);
    expect(json.commands[0].name).toBe('List Files');
  });

  it('returns empty commands array when none exist', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockCommandFind.mockReturnValue({
      sort: () => ({ lean: () => Promise.resolve([]) }),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.commands).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockCommandFind.mockReturnValue({
      sort: () => ({ lean: () => Promise.reject(new Error('DB error')) }),
    });

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch saved commands');
  });
});

describe('POST /api/terminal/commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq('POST', { name: 'Test', command: 'echo hi' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const res = await POST(makeReq('POST', { command: 'echo hi' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Name and command are required');
  });

  it('returns 400 when command is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const res = await POST(makeReq('POST', { name: 'Test' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Name and command are required');
  });

  it('returns 400 when name is blank whitespace', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const res = await POST(makeReq('POST', { name: '   ', command: 'echo hi' }));
    expect(res.status).toBe(400);
  });

  it('creates a saved command successfully', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const saved = {
      _id: 'cmd-1',
      name: 'List Files',
      command: 'ls -la',
      description: 'Lists files',
      category: 'General',
      createdBy: 'admin',
    };
    mockCommandCreate.mockResolvedValue({ toObject: () => saved });

    const res = await POST(
      makeReq('POST', {
        name: 'List Files',
        command: 'ls -la',
        description: 'Lists files',
        category: 'General',
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.command.name).toBe('List Files');
    expect(mockCommandCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'List Files',
        command: 'ls -la',
        createdBy: 'admin',
      })
    );
  });

  it('uses default category "General" when not provided', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const saved = {
      _id: 'cmd-2',
      name: 'Test',
      command: 'echo hi',
      category: 'General',
      createdBy: 'admin',
    };
    mockCommandCreate.mockResolvedValue({ toObject: () => saved });

    await POST(makeReq('POST', { name: 'Test', command: 'echo hi' }));

    expect(mockCommandCreate).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'General' })
    );
  });

  it('falls back to "unknown" createdBy when username missing', async () => {
    mockGetSession.mockResolvedValue({ user: {} });
    const saved = { _id: 'cmd-3', name: 'Test', command: 'echo hi', createdBy: 'unknown' };
    mockCommandCreate.mockResolvedValue({ toObject: () => saved });

    await POST(makeReq('POST', { name: 'Test', command: 'echo hi' }));

    expect(mockCommandCreate).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: 'unknown' })
    );
  });

  it('truncates name to 100 characters', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const longName = 'a'.repeat(200);
    const saved = { _id: 'cmd-4', name: 'a'.repeat(100), command: 'echo hi', createdBy: 'admin' };
    mockCommandCreate.mockResolvedValue({ toObject: () => saved });

    await POST(makeReq('POST', { name: longName, command: 'echo hi' }));

    expect(mockCommandCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'a'.repeat(100) })
    );
  });

  it('returns 500 on DB error', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockCommandCreate.mockRejectedValue(new Error('DB error'));

    const res = await POST(makeReq('POST', { name: 'Test', command: 'echo hi' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to create saved command');
  });
});

describe('PUT /api/terminal/commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PUT(makeReq('PUT', { id: '1', name: 'Test', command: 'echo hi' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when id is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const res = await PUT(makeReq('PUT', { name: 'Test', command: 'echo hi' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Command ID is required');
  });

  it('returns 400 when name is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const res = await PUT(makeReq('PUT', { id: '1', command: 'echo hi' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Name and command are required');
  });

  it('returns 400 when command is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const res = await PUT(makeReq('PUT', { id: '1', name: 'Test' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when command not found', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockCommandFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.resolve(null) });

    const res = await PUT(makeReq('PUT', { id: 'nonexistent', name: 'Test', command: 'echo hi' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Command not found');
  });

  it('updates a command successfully', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const updated = { _id: '1', name: 'Updated', command: 'ls -la', category: 'System' };
    mockCommandFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.resolve(updated) });

    const res = await PUT(
      makeReq('PUT', {
        id: '1',
        name: 'Updated',
        command: 'ls -la',
        category: 'System',
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.command.name).toBe('Updated');
    expect(mockCommandFindByIdAndUpdate).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        $set: expect.objectContaining({ name: 'Updated' }),
      }),
      { new: true }
    );
  });

  it('returns 500 on DB error', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockCommandFindByIdAndUpdate.mockReturnValue({
      lean: () => Promise.reject(new Error('DB error')),
    });

    const res = await PUT(makeReq('PUT', { id: '1', name: 'Test', command: 'echo hi' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to update saved command');
  });
});

describe('DELETE /api/terminal/commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await DELETE(
      makeReq('DELETE', undefined, 'http://localhost/api/terminal/commands?id=1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when id query param is missing', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    const res = await DELETE(
      makeReq('DELETE', undefined, 'http://localhost/api/terminal/commands')
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Command ID is required');
  });

  it('returns 404 when command not found', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockCommandFindByIdAndDelete.mockResolvedValue(null);

    const res = await DELETE(
      makeReq('DELETE', undefined, 'http://localhost/api/terminal/commands?id=nonexistent')
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Command not found');
  });

  it('deletes a command successfully', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockCommandFindByIdAndDelete.mockResolvedValue({ _id: '1', name: 'Test' });

    const res = await DELETE(
      makeReq('DELETE', undefined, 'http://localhost/api/terminal/commands?id=1')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockCommandFindByIdAndDelete).toHaveBeenCalledWith('1');
  });

  it('returns 500 on DB error', async () => {
    mockGetSession.mockResolvedValue({ user: { username: 'admin' } });
    mockCommandFindByIdAndDelete.mockRejectedValue(new Error('DB error'));

    const res = await DELETE(
      makeReq('DELETE', undefined, 'http://localhost/api/terminal/commands?id=1')
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to delete saved command');
  });
});
