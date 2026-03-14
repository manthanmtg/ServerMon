/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn, execFile } from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { EventEmitter } from 'node:events';

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
        triggerUpdate: () => Promise<{ success: boolean; pid?: number; message: string; runId?: string }>;
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
        const ee = new EventEmitter() as unknown as { 
            pid: number; 
            unref: () => void; 
            on: (e: string, cb: (c: number | null) => void) => void 
        };
        ee.pid = pid;
        ee.unref = vi.fn();
        return ee;
    };

    describe('triggerUpdate', () => {
        it('should trigger update via systemd-run if available', async () => {
            (execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }).mockImplementation((...args: unknown[]) => {
                const callback = args[args.length - 1] as (err: Error | null, result: { stdout: string; stderr: string }) => void;
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
            (execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }).mockImplementation((...args: unknown[]) => {
                const callback = args[args.length - 1] as (err: Error | null, result: { stdout: string; stderr: string }) => void;
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
    });

    describe('listUpdateRuns', () => {
        it('should return parsed metadata from files', async () => {
            vi.mocked(readdir).mockResolvedValue(['servermon_update_123.json'] as never);
            vi.mocked(readFile).mockResolvedValue(JSON.stringify({
                runId: '123',
                timestamp: new Date().toISOString(),
                status: 'completed',
                pid: 0,
                startedAt: new Date().toISOString()
            }));

            const runs = await systemUpdateService.listUpdateRuns();
            expect(runs).toHaveLength(1);
            expect((runs[0] as { runId: string }).runId).toBe('123');
        });

        it('should update status to completed if process is no longer running', async () => {
            vi.mocked(readdir).mockResolvedValue(['servermon_update_456.json'] as never);
            vi.mocked(readFile).mockResolvedValue(JSON.stringify({
                runId: '456',
                timestamp: new Date().toISOString(),
                status: 'running',
                pid: 9999,
                startedAt: new Date().toISOString()
            }));

            const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: number) => {
                if (pid === 9999) throw new Error('ESRCH');
                return true;
            });

            const runs = await systemUpdateService.listUpdateRuns();
            expect((runs[0] as { status: string }).status).toBe('completed');
            expect(writeFile).toHaveBeenCalled();
            killSpy.mockRestore();
        });
    });

    describe('getUpdateRunDetails', () => {
        it('should return full details including log content', async () => {
            vi.mocked(existsSync).mockReturnValue(true);
            (readFile as unknown as { mockImplementation: (fn: (path: string) => Promise<string>) => void }).mockImplementation(async (path: string) => {
                if (path.endsWith('.json')) return JSON.stringify({ runId: '789', status: 'completed', startedAt: new Date().toISOString() });
                if (path.endsWith('.log')) return 'Log output here';
                throw new Error('Not found');
            });

            const details = await systemUpdateService.getUpdateRunDetails('789');
            expect((details as { runId: string })?.runId).toBe('789');
            expect((details as { logContent: string })?.logContent).toBe('Log output here');
        });
    });
});
