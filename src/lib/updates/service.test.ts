/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import si from 'systeminformation';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock systeminformation
vi.mock('systeminformation', () => ({
  default: {
    osInfo: vi.fn(),
  },
  __esModule: true,
}));

const { mockLean } = vi.hoisted(() => ({
  mockLean: vi.fn().mockResolvedValue([
    {
      _id: 'history-1',
      timestamp: new Date(),
      packages: ['curl'],
      count: 1,
      success: true,
    },
  ]),
}));

// Mock db and models
vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/models/UpdateHistory', () => ({
  default: {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: mockLean,
        }),
      }),
    }),
  },
}));

interface UpdateInfo {
  name: string;
  manager: string;
  current?: string;
  latest?: string;
}

interface UpdateSnapshot {
  updates: UpdateInfo[];
  counts: {
    regular: number;
    security: number;
  };
  pendingRestart: boolean;
  restartRequiredBy: string[];
  osName: string;
  alerts: Array<{ id: string; title: string }>;
}

describe('UpdateService', () => {
  let updateService: {
    getSnapshot: (force?: boolean) => Promise<UpdateSnapshot>;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('SERVERMON_UPDATES_MOCK', '0');

    const mod = await import('./service');
    updateService = mod.updateService as unknown as typeof updateService;
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

      const fullCmd = `${cmd} ${cmdArgs.join(' ')}`;
      for (const [key, value] of Object.entries(outputs)) {
        if (fullCmd.includes(key)) {
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

  describe('getSnapshot', () => {
    it('should parse apt, npm, and pip updates correctly', async () => {
      vi.mocked(si.osInfo).mockResolvedValue({
        distro: 'Ubuntu',
        release: '24.04',
      } as unknown as si.Systeminformation.OsData);

      mockExec({
        'apt list --upgradable':
          'Listing...\nlibssl3/noble-updates 3.0.13-0ubuntu3.1 amd64 [upgradable from: 3.0.13-0ubuntu3]\n',
        'npm outdated -g --json': JSON.stringify({
          typescript: { current: '5.0.0', latest: '5.4.0' },
        }),
        'pip list --outdated --format=json': JSON.stringify([
          { name: 'requests', version: '2.31.0', latest_version: '2.32.0' },
        ]),
        'ls /var/run/reboot-required': '',
      });

      const snapshot = await updateService.getSnapshot(true);

      expect(snapshot.updates).toHaveLength(3);
      expect(snapshot.updates.find((u) => u.manager === 'apt')?.name).toBe('libssl3');
      expect(snapshot.updates.find((u) => u.manager === 'npm')?.name).toBe('typescript');
      expect(snapshot.updates.find((u) => u.manager === 'pip')?.name).toBe('requests');
      expect(snapshot.counts.regular).toBeGreaterThanOrEqual(1);
    });

    it('should detect pending restart on Debian/Ubuntu', async () => {
      vi.mocked(si.osInfo).mockResolvedValue({
        distro: 'Ubuntu',
        release: '24.04',
      } as unknown as si.Systeminformation.OsData);

      mockExec({
        'ls /var/run/reboot-required': '/var/run/reboot-required\n',
        'cat /var/run/reboot-required.pkgs': 'linux-image-generic\nlibc6\n',
        'apt list': '',
        'npm outdated': '{}',
        'pip list': '[]',
      });

      const snapshot = await updateService.getSnapshot(true);
      expect(snapshot.pendingRestart).toBe(true);
      expect(snapshot.restartRequiredBy).toContain('linux-image-generic');
    });

    it('should generate security alerts', async () => {
      vi.mocked(si.osInfo).mockResolvedValue({
        distro: 'Ubuntu',
        release: '24.04',
      } as unknown as si.Systeminformation.OsData);

      mockExec({
        'apt list --upgradable':
          'Listing...\nlinux-libc-dev/noble-security 6.8.0-35.35 amd64 [upgradable from: 6.8.0-31.31]\n',
        'npm outdated': '{}',
        'pip list': '[]',
        'ls /var/run/reboot-required': '',
      });

      const snapshot = await updateService.getSnapshot(true);
      expect(snapshot.alerts).toHaveLength(1);
      expect(snapshot.alerts[0].id).toBe('security-updates');
    });

    it('should use cache if duration has not passed', async () => {
      vi.mocked(si.osInfo).mockResolvedValue({
        distro: 'Ubuntu',
        release: '24.04',
      } as unknown as si.Systeminformation.OsData);
      mockExec({
        'apt list': 'Listing...\n',
        'npm outdated': '{}',
        'pip list': '[]',
        'ls /var/run/reboot-required': '',
      });

      await updateService.getSnapshot(true); // Populate cache
      expect(si.osInfo).toHaveBeenCalledTimes(1);

      await updateService.getSnapshot(false); // Should use cache
      expect(si.osInfo).toHaveBeenCalledTimes(1);
    });

    it('should fallback to mock data if forced', async () => {
      vi.stubEnv('SERVERMON_UPDATES_MOCK', '1');
      const snapshot = await updateService.getSnapshot(true);
      expect(snapshot.updates.length).toBeGreaterThan(0);
      expect(snapshot.osName).toBe('Ubuntu');
    });
  });
});
