/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetSession,
  mockListOSUsers,
  mockListWebUsers,
  mockCreateOSUser,
  mockUpdateWebUserRole,
  mockToggleSudo,
  mockDeleteWebUser,
  mockDeleteOSUser,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockListOSUsers: vi.fn(),
  mockListWebUsers: vi.fn(),
  mockCreateOSUser: vi.fn(),
  mockUpdateWebUserRole: vi.fn(),
  mockToggleSudo: vi.fn(),
  mockDeleteWebUser: vi.fn(),
  mockDeleteOSUser: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/users/service', () => ({
  usersService: {
    listOSUsers: mockListOSUsers,
    listWebUsers: mockListWebUsers,
    createOSUser: mockCreateOSUser,
    updateWebUserRole: mockUpdateWebUserRole,
    toggleSudo: mockToggleSudo,
    deleteWebUser: mockDeleteWebUser,
    deleteOSUser: mockDeleteOSUser,
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, POST, PATCH, DELETE } from './route';

function makeRequest(method: string, body?: unknown, params?: Record<string, string>): Request {
  const url = new URL('http://localhost/api/modules/users');
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/modules/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not admin', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-admin role', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('returns OS users by default', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockListOSUsers.mockResolvedValue([{ username: 'root' }]);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0].username).toBe('root');
  });

  it('returns OS users when type=os', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockListOSUsers.mockResolvedValue([]);
    const res = await GET(makeRequest('GET', undefined, { type: 'os' }));
    expect(res.status).toBe(200);
    expect(mockListOSUsers).toHaveBeenCalled();
  });

  it('returns web users when type=web', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockListWebUsers.mockResolvedValue([{ username: 'admin' }]);
    const res = await GET(makeRequest('GET', undefined, { type: 'web' }));
    expect(res.status).toBe(200);
    expect(mockListWebUsers).toHaveBeenCalled();
  });

  it('returns 500 on service error', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockListOSUsers.mockRejectedValue(new Error('failed'));
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/modules/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not admin', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', { type: 'os', username: 'newuser' }));
    expect(res.status).toBe(401);
  });

  it('creates OS user', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockCreateOSUser.mockResolvedValue(undefined);
    const res = await POST(
      makeRequest('POST', { type: 'os', username: 'newuser', shell: '/bin/bash' })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('OS user created successfully');
  });

  it('returns 400 for invalid user type', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const res = await POST(makeRequest('POST', { type: 'web', username: 'user' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 on service error', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockCreateOSUser.mockRejectedValue(new Error('useradd failed'));
    const res = await POST(makeRequest('POST', { type: 'os', username: 'test' }));
    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/modules/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not admin', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PATCH(makeRequest('PATCH', {}));
    expect(res.status).toBe(401);
  });

  it('updates web user role', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockUpdateWebUserRole.mockResolvedValue(undefined);
    const res = await PATCH(makeRequest('PATCH', { type: 'web', id: 'user-1', role: 'admin' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('Web user role updated');
  });

  it('toggles OS user sudo', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockToggleSudo.mockResolvedValue(undefined);
    const res = await PATCH(makeRequest('PATCH', { type: 'os', username: 'user1', sudo: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toContain('sudo');
  });

  it('returns 400 for invalid parameters', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const res = await PATCH(makeRequest('PATCH', { type: 'invalid' }));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/modules/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not admin', async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE', undefined, { type: 'web', id: '1' }));
    expect(res.status).toBe(401);
  });

  it('deletes web user', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockDeleteWebUser.mockResolvedValue(undefined);
    const res = await DELETE(makeRequest('DELETE', undefined, { type: 'web', id: 'user-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('Web user deleted');
  });

  it('deletes OS user', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    mockDeleteOSUser.mockResolvedValue(undefined);
    const res = await DELETE(makeRequest('DELETE', undefined, { type: 'os', username: 'user1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('OS user deleted');
  });

  it('returns 400 for invalid deletion params', async () => {
    mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
    const res = await DELETE(makeRequest('DELETE', undefined, {}));
    expect(res.status).toBe(400);
  });
});
