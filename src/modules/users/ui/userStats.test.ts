import { describe, expect, it } from 'vitest';
import { summarizeUserStats } from './userStats';

describe('summarizeUserStats', () => {
  it('counts array payloads and admin web users', () => {
    expect(
      summarizeUserStats({
        osPayload: [{ username: 'root' }, { username: 'deploy' }],
        webPayload: [
          { username: 'admin', role: 'admin' },
          { username: 'operator', role: 'user' },
          { username: 'owner', role: 'admin' },
        ],
      })
    ).toEqual({ osCount: 2, webCount: 3, admins: 2 });
  });

  it('treats malformed payloads as empty lists', () => {
    expect(
      summarizeUserStats({
        osPayload: { users: [{ username: 'root' }] },
        webPayload: null,
      })
    ).toEqual({ osCount: 0, webCount: 0, admins: 0 });
  });
});
