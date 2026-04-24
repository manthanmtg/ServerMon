/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockConnectDB, mockUserFind, mockUserFindByIdAndDelete, mockUserFindByIdAndUpdate } =
  vi.hoisted(() => ({
    mockConnectDB: vi.fn().mockResolvedValue(undefined),
    mockUserFind: vi.fn(),
    mockUserFindByIdAndDelete: vi.fn().mockResolvedValue(undefined),
    mockUserFindByIdAndUpdate: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
  },
  readFile: vi.fn().mockRejectedValue(new Error('not found')),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));

vi.mock('@/models/User', () => ({
  default: {
    find: mockUserFind,
    findByIdAndDelete: mockUserFindByIdAndDelete,
    findByIdAndUpdate: mockUserFindByIdAndUpdate,
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { usersService } from './service';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Configure execFile mock to respond based on the command string.
 * outputs: { 'cat /etc/passwd': '...', 'groups root': '...' }
 */
function mockExec(outputs: Record<string, string | Error>) {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
    const cmd = args[0] as string;
    const cmdArgs = args[1] as string[];
    const callback = args[args.length - 1] as (
      err: Error | null,
      result: { stdout: string; stderr: string }
    ) => void;

    const fullCmd = `${cmd} ${cmdArgs.join(' ')}`.trim();
    const sortedKeys = Object.keys(outputs).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
      if (fullCmd.includes(key)) {
        const value = outputs[key];
        if (value instanceof Error) {
          callback(value, { stdout: '', stderr: value.message });
        } else {
          callback(null, { stdout: value, stderr: '' });
        }
        return;
      }
    }
    callback(null, { stdout: '', stderr: '' });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
  });

  // ── listOSUsers ──────────────────────────────────────────────────────────

  describe('listOSUsers()', () => {
    it('parses /etc/passwd and returns root and UID>=1000 users', async () => {
      mockExec({
        'cat /etc/passwd':
          'root:x:0:0:root:/root:/bin/bash\n' +
          'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n' +
          'alice:x:1001:1001:Alice:/home/alice:/bin/bash\n',
        'groups root': 'root : root sudo wheel\n',
        'groups alice': 'alice : alice docker\n',
      });

      const users = await usersService.listOSUsers();

      const usernames = users.map((u) => u.username);
      expect(usernames).toContain('root');
      expect(usernames).toContain('alice');
      // daemon has UID=1, should be excluded
      expect(usernames).not.toContain('daemon');
    });

    it('correctly sets hasSudo=true for users in the sudo group', async () => {
      mockExec({
        'cat /etc/passwd': 'alice:x:1001:1001:Alice:/home/alice:/bin/bash\n',
        'groups alice': 'alice : alice sudo docker\n',
      });

      const users = await usersService.listOSUsers();

      const alice = users.find((u) => u.username === 'alice');
      expect(alice).toBeDefined();
      expect(alice!.hasSudo).toBe(true);
    });

    it('correctly sets hasSudo=false for unprivileged users', async () => {
      mockExec({
        'cat /etc/passwd': 'bob:x:1002:1002:Bob:/home/bob:/bin/bash\n',
        'groups bob': 'bob : bob developers\n',
      });

      const users = await usersService.listOSUsers();

      const bob = users.find((u) => u.username === 'bob');
      expect(bob).toBeDefined();
      expect(bob!.hasSudo).toBe(false);
    });

    it('sets hasSudo=true for root unconditionally', async () => {
      mockExec({
        'cat /etc/passwd': 'root:x:0:0:root:/root:/bin/bash\n',
        'groups root': 'root : root\n',
      });

      const users = await usersService.listOSUsers();

      const root = users.find((u) => u.username === 'root');
      expect(root).toBeDefined();
      expect(root!.hasSudo).toBe(true);
    });

    it('parses numeric UID and GID correctly', async () => {
      mockExec({
        'cat /etc/passwd': 'carol:x:1003:1004:Carol:/home/carol:/bin/zsh\n',
        'groups carol': 'carol : carol\n',
      });

      const users = await usersService.listOSUsers();

      const carol = users.find((u) => u.username === 'carol');
      expect(carol!.uid).toBe(1003);
      expect(carol!.gid).toBe(1004);
      expect(carol!.shell).toBe('/bin/zsh');
      expect(carol!.home).toBe('/home/carol');
    });

    it('returns sshKeysCount=0 when authorized_keys is missing', async () => {
      mockExec({
        'cat /etc/passwd': 'dave:x:1005:1005:Dave:/home/dave:/bin/bash\n',
        'groups dave': 'dave : dave\n',
      });

      const users = await usersService.listOSUsers();

      const dave = users.find((u) => u.username === 'dave');
      expect(dave!.sshKeysCount).toBe(0);
    });

    it('returns an empty array when the cat command fails', async () => {
      mockExec({ cat: new Error('Permission denied') });

      const users = await usersService.listOSUsers();
      expect(users).toEqual([]);
    });
  });

  // ── createOSUser ─────────────────────────────────────────────────────────

  describe('createOSUser()', () => {
    it('runs useradd with the correct arguments including -- separator', async () => {
      mockExec({ 'sudo useradd': '' });

      await usersService.createOSUser('newuser');

      const calls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const usraddCall = calls.find((c: unknown[]) => (c[1] as string[]).includes('useradd'));
      expect(usraddCall).toBeDefined();
      expect(usraddCall![1]).toContain('newuser');
      expect(usraddCall![1]).toContain('--');
      // Ensure -- comes before username
      const args = usraddCall![1] as string[];
      expect(args.indexOf('--')).toBeLessThan(args.indexOf('newuser'));
    });

    it('uses the provided shell', async () => {
      mockExec({ 'sudo useradd': '' });

      await usersService.createOSUser('newuser', '/bin/zsh');

      const calls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const usraddCall = calls.find((c: unknown[]) => (c[1] as string[]).includes('useradd'));
      expect(usraddCall![1]).toContain('/bin/zsh');
    });

    it('throws for invalid username format', async () => {
      await expect(usersService.createOSUser('Invalid User!')).rejects.toThrow('Invalid username format');
      await expect(usersService.createOSUser('123user')).rejects.toThrow('Invalid username format');
      await expect(usersService.createOSUser('-baduser')).rejects.toThrow('Invalid username format');
    });

    it('throws for invalid shell path', async () => {
      await expect(usersService.createOSUser('newuser', '/usr/bin/evil-shell')).rejects.toThrow('Invalid shell path');
    });

    it('throws when useradd returns an error stderr', async () => {
      mockExec({
        'sudo useradd': Object.assign(new Error('useradd failed'), {
          stderr: 'useradd: Permission denied',
        }),
      });

      await expect(usersService.createOSUser('newuser')).rejects.toThrow();
    });
  });

  // ── deleteOSUser ─────────────────────────────────────────────────────────

  describe('deleteOSUser()', () => {
    it('runs userdel with the username and -- separator', async () => {
      mockExec({ 'sudo userdel': '' });

      await usersService.deleteOSUser('olduser');

      const calls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const delCall = calls.find((c: unknown[]) => (c[1] as string[]).includes('userdel'));
      expect(delCall).toBeDefined();
      expect(delCall![1]).toContain('olduser');
      expect(delCall![1]).toContain('--');
    });

    it('throws for invalid username format', async () => {
      await expect(usersService.deleteOSUser('; rm -rf /')).rejects.toThrow('Invalid username format');
    });
  });

  // ── toggleSudo ───────────────────────────────────────────────────────────

  describe('toggleSudo()', () => {
    it('adds user to sudo group when enabling with -- separator', async () => {
      mockExec({
        'groups alice': 'alice : alice developers\n',
        'sudo usermod': '',
      });

      await usersService.toggleSudo('alice', true);

      const calls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const usermodCall = calls.find((c: unknown[]) => (c[1] as string[]).includes('usermod'));
      expect(usermodCall).toBeDefined();
      expect(usermodCall![1]).toContain('-aG');
      expect(usermodCall![1]).toContain('sudo');
      expect(usermodCall![1]).toContain('--');
    });

    it('does nothing if user is already in sudo group when enabling', async () => {
      mockExec({ 'groups alice': 'alice : alice sudo developers\n' });

      await usersService.toggleSudo('alice', true);

      const calls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const usermodCall = calls.find(
        (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('usermod')
      );
      expect(usermodCall).toBeUndefined();
    });

    it('removes sudo from group list when disabling', async () => {
      mockExec({
        'groups bob': 'bob : bob sudo developers\n',
        'sudo usermod': '',
      });

      await usersService.toggleSudo('bob', false);

      const calls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const usermodCall = calls.find((c: unknown[]) => (c[1] as string[]).includes('usermod'));
      expect(usermodCall).toBeDefined();
      expect(usermodCall![1]).toContain('--');
      // The new groups list should not contain 'sudo'
      const groupsArg = (usermodCall![1] as string[]).find((a) => a.includes('developers'));
      expect(groupsArg).toBeDefined();
      expect(groupsArg).not.toContain('sudo');
    });
  });

  // ── listWebUsers ─────────────────────────────────────────────────────────

  describe('listWebUsers()', () => {
    it('connects to the DB and returns a mapped list of users', async () => {
      const now = new Date();
      mockUserFind.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              _id: 'id-1',
              username: 'admin',
              role: 'admin',
              isActive: true,
              lastLoginAt: now,
              createdAt: now,
            },
            {
              _id: 'id-2',
              username: 'user1',
              role: 'user',
              isActive: false,
              lastLoginAt: undefined,
              createdAt: now,
            },
          ]),
        }),
      });

      const users = await usersService.listWebUsers();

      expect(mockConnectDB).toHaveBeenCalledOnce();
      expect(users).toHaveLength(2);

      expect(users[0]).toMatchObject({
        id: 'id-1',
        username: 'admin',
        role: 'admin',
        isActive: true,
        lastLoginAt: now.toISOString(),
      });
      expect(users[1]).toMatchObject({
        id: 'id-2',
        username: 'user1',
        role: 'user',
        isActive: false,
        lastLoginAt: undefined,
      });
    });

    it('returns an empty array when the DB query fails', async () => {
      mockUserFind.mockImplementation(() => {
        throw new Error('DB error');
      });

      const users = await usersService.listWebUsers();
      expect(users).toEqual([]);
    });
  });

  // ── deleteWebUser ────────────────────────────────────────────────────────

  describe('deleteWebUser()', () => {
    it('calls findByIdAndDelete with the provided id', async () => {
      await usersService.deleteWebUser('abc123');

      expect(mockConnectDB).toHaveBeenCalledOnce();
      expect(mockUserFindByIdAndDelete).toHaveBeenCalledWith('abc123');
    });

    it('throws and propagates errors from the DB', async () => {
      mockUserFindByIdAndDelete.mockRejectedValueOnce(new Error('DB error'));

      await expect(usersService.deleteWebUser('abc123')).rejects.toThrow('DB error');
    });
  });

  // ── updateWebUserRole ────────────────────────────────────────────────────

  describe('updateWebUserRole()', () => {
    it('calls findByIdAndUpdate with the correct role', async () => {
      await usersService.updateWebUserRole('user-id-1', 'admin');

      expect(mockConnectDB).toHaveBeenCalledOnce();
      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith('user-id-1', { role: 'admin' });
    });

    it('updates to user role', async () => {
      await usersService.updateWebUserRole('user-id-2', 'user');

      expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith('user-id-2', { role: 'user' });
    });

    it('throws when the DB update fails', async () => {
      mockUserFindByIdAndUpdate.mockRejectedValueOnce(new Error('Update failed'));

      await expect(usersService.updateWebUserRole('id-1', 'admin')).rejects.toThrow(
        'Update failed'
      );
    });
  });
});
