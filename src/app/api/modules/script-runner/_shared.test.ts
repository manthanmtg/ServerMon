import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorized, data } from './_shared';

const { currentUser, session } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  session: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: async () => undefined }));
vi.mock('@/lib/session', () => ({ getSession: session }));
vi.mock('@/models/User', () => ({
  default: { findOne: () => ({ select: () => ({ lean: currentUser }) }) },
}));

describe('Script Runner access', () => {
  const request = new Request('http://localhost/api/modules/script-runner');
  const action = vi.fn(async () => data({ allowed: true }));

  beforeEach(() => {
    vi.resetAllMocks();
    session.mockResolvedValue({ user: { id: '504be61aa1e8e177abcd1234', role: 'admin' } });
    action.mockImplementation(async () => data({ allowed: true }));
  });

  it('denies a valid session when the administrator has been removed or demoted', async () => {
    currentUser.mockResolvedValue(null);
    expect((await authorized(request, action)).status).toBe(403);
    expect(action).not.toHaveBeenCalled();
  });

  it('uses the administrator name from the current account', async () => {
    currentUser.mockResolvedValue({ username: 'current-name' });
    expect((await authorized(request, action)).status).toBe(200);
    expect(action).toHaveBeenCalledWith({ username: 'current-name' });
  });

  it('rejects mutation requests from sibling origins', async () => {
    const crossOrigin = new Request('http://localhost/api/modules/script-runner/runs', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-site' },
    });
    expect((await authorized(crossOrigin, action)).status).toBe(403);
    expect(action).not.toHaveBeenCalled();
  });
});
