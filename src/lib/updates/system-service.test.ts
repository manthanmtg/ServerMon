/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn, execFile } from 'node:child_process';
import { existsSync, openSync, Stats } from 'node:fs';
import { readdir, readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { UpdateRunStatus } from '@/types/updates';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
}));

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  openSync: vi.fn(),
  closeSync: vi.fn(),
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

describe('SystemUpdateService', () => {
  let systemUpdateService: {
    triggerUpdate: () => Promise<{
      success: boolean;
      pid?: number;
      message: string;
      runId?: string;
    }>;
    listUpdateRuns: () => Promise<unknown[]>;
    getUpdateRunDetails: (id: string) => Promise<unknown>;
    activeRuns: Map<string, unknown>;
    systemdRunAvailable: boolean | null;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('UPDATE_LOG_DIR', '/tmp/logs');
    vi.stubEnv('SERVERMON_REPO_DIR', '/app');
    vi.stubEnv('NODE_ENV', 'production');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(readdir).mockResolvedValue([]);
    vi.mocked(openSync).mockReturnValue(10);

    const mod = await import('./system-service');
    systemUpdateService = mod.systemUpdateService as unknown as typeof systemUpdateService;

    // Reset private state using type assertions for testing
    const internal = systemUpdateService as unknown as {
      activeRuns: Map<string, unknown>;
      systemdRunAvailable: boolean | null;
      checkSystemdRun: () => Promise<boolean>;
    };
    internal.activeRuns.clear();
    internal.systemdRunAvailable = null;
  });

  const mockChild = (pid: number) => {
    const ee = new EventEmitter();
    const child = ee as unknown as {
      pid: number;
      unref: () => void;
      on: (e: string, cb: (c: number | null) => void) => void;
      emit: (e: string, ...args: unknown[]) => boolean;
    };
    child.pid = pid;
    child.unref = vi.fn();
    return child;
  };

  describe('triggerUpdate', () => {
    it('should trigger update via systemd-run if available', async () => {
      (
        execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }
      ).mockImplementation((...args: unknown[]) => {
        const callback = args[args.length - 1] as (
          err: Error | null,
          result: { stdout: string; stderr: string }
        ) => void;
        callback(null, { stdout: 'v255', stderr: '' });
      });
      const child = mockChild(1234);
      (spawn as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(child);

      const result = await systemUpdateService.triggerUpdate();

      expect(result.success).toBe(true);
      expect(result.pid).toBe(1234);

      expect(spawn).toHaveBeenCalled();
      const lastCall = vi.mocked(spawn).mock.calls.at(-1)!;
      expect(lastCall[0]).toBe('systemd-run');
    });

    it('should fallback to sudo if systemd-run is missing', async () => {
      (
        execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }
      ).mockImplementation((...args: unknown[]) => {
        const callback = args[args.length - 1] as (
          err: Error | null,
          result: { stdout: string; stderr: string }
        ) => void;
        callback(new Error('not found'), { stdout: '', stderr: 'not found' });
      });

      const child = mockChild(5678);
      (spawn as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(child);

      const result = await systemUpdateService.triggerUpdate();

      expect(result.success).toBe(true);
      expect(result.pid).toBe(5678);

      expect(spawn).toHaveBeenCalled();
      const lastCall = vi.mocked(spawn).mock.calls.at(-1)!;
      expect(lastCall[0]).toBe('sudo');
    });

    it('should handle process exit and update metadata', async () => {
      const child = mockChild(999);
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      await systemUpdateService.triggerUpdate();

      // Trigger exit
      child.emit('exit', 0);
      expect(writeFile).toHaveBeenCalled();
      const lastWrite = vi.mocked(writeFile).mock.calls.at(-1)!;
      expect(lastWrite[1]).toContain('"status": "completed"');
    });

    it('should handle process error and update metadata', async () => {
      const child = mockChild(888);
      vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);

      await systemUpdateService.triggerUpdate();

      // Trigger error
      child.emit('error', new Error('spawn failed'));
      expect(writeFile).toHaveBeenCalled();
      const lastWrite = vi.mocked(writeFile).mock.calls.at(-1)!;
      expect(lastWrite[1]).toContain('"status": "failed"');
    });

    it('should return failure if spawn fails to return pid', async () => {
      const child = { unref: vi.fn() } as unknown as ReturnType<typeof spawn>;
      vi.mocked(spawn).mockReturnValue(child);

      const result = await systemUpdateService.triggerUpdate();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to get PID');
    });
  });

  describe('listUpdateRuns', () => {
    it('should return parsed metadata from files', async () => {
      vi.mocked(readdir).mockResolvedValue(['servermon_update_123.json'] as never);
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runId: '123',
          timestamp: new Date().toISOString(),
          status: 'completed',
          pid: 0,
          startedAt: new Date().toISOString(),
        })
      );

      const runs = await systemUpdateService.listUpdateRuns();
      expect(runs).toHaveLength(1);
      expect((runs[0] as { runId: string }).runId).toBe('123');
    });

    it('should update status to completed and infer finishedAt from log mtime if process is stale', async () => {
      vi.mocked(readdir).mockResolvedValue(['servermon_update_456.json'] as never);
      const startedAt = new Date(Date.now() - 3600000).toISOString();
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runId: '456',
          timestamp: startedAt,
          status: 'running',
          pid: 9999,
          startedAt: startedAt,
        })
      );

      const mtime = new Date(Date.now() - 3300000);
      vi.mocked(stat).mockImplementation(async (p: unknown) => {
        if (String(p).endsWith('.log')) return { mtime } as Stats;
        return { mtime: new Date() } as Stats;
      });
      vi.mocked(existsSync).mockImplementation(((p: unknown) => {
        if (typeof p === 'string') {
          if (p.endsWith('.log')) return true;
          if (p.endsWith('.json')) return true;
        }
        return false;
      }) as (p: unknown) => boolean);

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (pid === 9999) throw new Error('ESRCH');
        return true;
      });

      const runs = await systemUpdateService.listUpdateRuns();
      const run = runs[0] as UpdateRunStatus;
      expect(run.status).toBe('completed');
      expect(run.finishedAt).toBe(mtime.toISOString());
      expect(writeFile).toHaveBeenCalled();
      killSpy.mockRestore();
    });

    it('should retroactively fix completed runs with suspiciously long durations', async () => {
      vi.mocked(readdir).mockResolvedValue(['servermon_update_777.json'] as never);
      const startedAt = new Date(Date.now() - 3600000).toISOString();
      // Stored finish at is 1 hour later (suspicious)
      const suspiciousFinishedAt = new Date(Date.now()).toISOString();
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          runId: '777',
          timestamp: startedAt,
          status: 'completed',
          pid: 0,
          startedAt: startedAt,
          finishedAt: suspiciousFinishedAt,
        })
      );

      // Actual log mtime is only 5 mins after start
      const mtime = new Date(new Date(startedAt).getTime() + 300000);
      vi.mocked(stat).mockImplementation(async (p: unknown) => {
        if (String(p).endsWith('.log')) return { mtime } as Stats;
        return { mtime: new Date() } as Stats;
      });
      vi.mocked(existsSync).mockImplementation(((p: unknown) => {
        if (typeof p === 'string') {
          if (p.endsWith('.log')) return true;
          if (p.endsWith('.json')) return true;
        }
        return false;
      }) as (p: unknown) => boolean);

      const runs = await systemUpdateService.listUpdateRuns();
      const run = runs[0] as UpdateRunStatus;
      expect(run.status).toBe('completed');
      expect(run.finishedAt).toBe(mtime.toISOString());
      expect(writeFile).toHaveBeenCalled();
    });

    it('should handle corrupt metadata files', async () => {
      vi.mocked(readdir).mockResolvedValue(['servermon_update_corrupt.json'] as never);
      vi.mocked(readFile).mockResolvedValue('invalid-json');

      const runs = await systemUpdateService.listUpdateRuns();
      expect(runs).toHaveLength(0);
    });
  });

  describe('getUpdateRunDetails', () => {
    it('should return full details including log content', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      (
        readFile as unknown as {
          mockImplementation: (fn: (path: string) => Promise<string>) => void;
        }
      ).mockImplementation(async (path: string) => {
        if (path.endsWith('.json'))
          return JSON.stringify({
            runId: '789',
            status: 'completed',
            startedAt: new Date().toISOString(),
          });
        if (path.endsWith('.log')) return 'Log output here';
        throw new Error('Not found');
      });

      const details = await systemUpdateService.getUpdateRunDetails('789');
      expect((details as { runId: string })?.runId).toBe('789');
      expect((details as { logContent: string })?.logContent).toBe('Log output here');
    });

    it('should truncate log content if it exceeds MAX_OUTPUT_BYTES', async () => {
      const largeLog = 'a'.repeat(128 * 1024 + 100);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockImplementation(((path: string | Buffer | URL | number) => {
        if (path.toString().endsWith('.json')) return Promise.resolve(JSON.stringify({ runId: 'large' }));
        return Promise.resolve(largeLog);
      }) as unknown as typeof readFile);

      const details = await systemUpdateService.getUpdateRunDetails('large');
      expect(details).not.toBeNull();
      const run = details as { logContent?: string };
      expect(run.logContent).toContain('... [truncated]');
      expect(run.logContent?.length).toBeLessThan(largeLog.length);
    });

    it('should handle missing log file gracefully', async () => {
      vi.mocked(existsSync).mockImplementation(((path: string | Buffer | URL) => {
        if (path.toString().endsWith('.json')) return true;
        if (path.toString().endsWith('.log')) return false;
        return false;
      }) as unknown as typeof existsSync);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ runId: 'no-log' }));

      const details = await systemUpdateService.getUpdateRunDetails('no-log');
      expect(details).not.toBeNull();
      const run = details as { logContent?: string };
      expect(run.logContent).toBeUndefined();
    });
  });

  describe('Private Methods (via casting)', () => {
    it('ensureLogDir should fallback to tmpdir on failure', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdir).mockRejectedValue(new Error('Permission denied'));
      const internal = systemUpdateService as unknown as { ensureLogDir: () => Promise<string> };
      const dir = await internal.ensureLogDir();
      expect(dir).toBeDefined();
      expect(dir).not.toBe('/tmp/logs'); // It should be os.tmpdir()
    });

    it('pruneOldRuns should delete oldest files', async () => {
      const internal = systemUpdateService as unknown as {
        pruneOldRuns: (dir: string) => Promise<void>;
      };
      const logDir = '/tmp/logs';
      const files: string[] = [];
      const stats = new Map<string, { mtime: Date }>();

      // Create 55 files (exceeding 50 limit)
      for (let i = 1; i <= 55; i++) {
        const name = `servermon_update_${i}.json`;
        files.push(name);
        files.push(`servermon_update_${i}.log`);
        stats.set(join(logDir, name), { mtime: new Date(2026, 0, i) });
      }

      vi.mocked(readdir).mockResolvedValue(files as unknown as Awaited<ReturnType<typeof readdir>>);
      vi.mocked(stat).mockImplementation(async (p: unknown) => stats.get(String(p)) as unknown as Stats);
      vi.mocked(unlink).mockResolvedValue(undefined);

      await internal.pruneOldRuns(logDir);

      // Should delete 5 oldest runs (10 files: 5 json + 5 log)
      expect(vi.mocked(unlink)).toHaveBeenCalledTimes(10);
      const firstDelete = vi.mocked(unlink).mock.calls[0][0].toString();
      expect(firstDelete).toContain('servermon_update_1.json');
    });
  });
});
