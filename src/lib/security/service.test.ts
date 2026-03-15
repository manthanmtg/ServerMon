/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { securityService } from './service';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('SecurityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('process', { ...process, platform: 'linux' });
  });

  const mockExec = (outputs: Record<string, string | Error>) => {
    (
      execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }
    ).mockImplementation((...args: unknown[]) => {
      const cmd = args[0] as string;
      const cmdArgs = args[1] as string[];
      const callback = args[args.length - 1] as (
        err: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;

      const fullCmd = `${cmd} ${cmdArgs.join(' ')}`.trim();
      // Sort keys by length descending to match most specific first
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
  };

  const mockReadFile = (outputs: Record<string, string | Error>) => {
    (
      readFile as unknown as { mockImplementation: (fn: (path: string) => Promise<string>) => void }
    ).mockImplementation(async (path: string) => {
      for (const [key, value] of Object.entries(outputs)) {
        if (path.includes(key)) {
          if (value instanceof Error) throw value;
          return value;
        }
      }
      throw new Error(`File not found: ${path}`);
    });
  };

  describe('getSnapshot', () => {
    it('should return live security snapshot with correctly parsed status', async () => {
      mockExec({
        'ufw status verbose':
          'Status: active\nDefault: deny (incoming), allow (outgoing)\n1 22 ALLOW IN Anywhere\n',
        'fail2ban-client status sshd':
          'Currently banned: 2\nTotal banned: 10\nBanned IP list: 1.1.1.1 2.2.2.2\n',
        'fail2ban-client status nginx':
          'Currently banned: 1\nTotal banned: 5\nBanned IP list: 3.3.3.3\n',
        'fail2ban-client status': 'Jail list: sshd, nginx\n',
        'last -n 20': 'admin pts/0 192.168.1.10 Mon Mar 10 14:23\n',
        'lastb -n 10': 'root ssh 203.0.113.42 Mon Mar 10 23:45\n',
        'apt list --upgradable':
          'Listing...\nopenssl/noble-security 3.0.13-0ubuntu3.1 amd64 [upgradable from: 3.0.13-0ubuntu3]\n',
      });

      mockReadFile({
        '/etc/ssh/sshd_config':
          'PermitRootLogin no\nPasswordAuthentication no\nPort 2222\nMaxAuthTries 3\n',
        '/etc/passwd':
          'root:x:0:0:root:/root:/bin/bash\nadmin:x:1000:1000:admin:/home/admin:/bin/bash\n',
      });

      const snapshot = await securityService.getSnapshot();

      expect(snapshot.source).toBe('live');
      expect(snapshot.firewall.enabled).toBe(true);
      expect(snapshot.fail2ban.running).toBe(true);
      expect(snapshot.fail2ban.totalBanned).toBe(3);
      expect(snapshot.ssh?.permitRootLogin).toBe('no');
      expect(snapshot.ssh?.port).toBe('2222');
      expect(snapshot.users).toHaveLength(2);
      expect(snapshot.pendingUpdates).toHaveLength(1);
      expect(snapshot.score).toBeGreaterThan(0);
    });

    it('should fallback to iptables if ufw is not installed', async () => {
      (
        execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }
      ).mockImplementation((...args: unknown[]) => {
        const cmd = args[0] as string;
        const callback = args[args.length - 1] as (
          err: Error | null,
          result: { stdout: string; stderr: string }
        ) => void;
        if (cmd === 'ufw')
          callback(new Error('command not found'), { stdout: '', stderr: 'command not found' });
        else if (cmd === 'iptables')
          callback(null, {
            stdout: 'Chain INPUT (policy ACCEPT)\ntarget prot opt source destination\n',
            stderr: '',
          });
        else callback(null, { stdout: '', stderr: '' });
      });
      mockReadFile({ '/etc/ssh/sshd_config': '', '/etc/passwd': '' });

      const snapshot = await securityService.getSnapshot();
      expect(snapshot.firewall.backend).toBe('iptables');
      expect(snapshot.firewall.enabled).toBe(true);
    });

    it('should return mock data on non-linux systems', async () => {
      vi.stubGlobal('process', { ...process, platform: 'darwin' } as unknown as NodeJS.Process);
      const snapshot = await securityService.getSnapshot();
      expect(snapshot.source).toBe('mock');
    });

    it('should handle missing configuration files gracefully', async () => {
      mockExec({ ufw: '', 'fail2ban-client': '', last: '', apt: '' });
      mockReadFile({
        '/etc/ssh/sshd_config': new Error('Permission denied'),
        '/etc/passwd': new Error('Permission denied'),
      });

      const snapshot = await securityService.getSnapshot();
      expect(snapshot.ssh).toBeNull();
      expect(snapshot.users).toHaveLength(0);
    });
  });
});
