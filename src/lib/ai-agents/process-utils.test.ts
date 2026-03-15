/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
    exec: vi.fn(),
}));

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
}));

vi.mock('os', () => ({
    homedir: vi.fn().mockReturnValue('/home/testuser'),
    userInfo: vi.fn().mockReturnValue({ username: 'testuser' }),
}));

import { exec } from 'child_process';
import * as fs from 'fs';
import { getProcessResourceUsage, detectGitInfo, killProcess, discoverHomeDirs } from './process-utils';

function mockExec(stdout: string, error: Error | null = null) {
    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
            cb(error, stdout, '');
        }
    );
}

describe('process-utils', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('getProcessResourceUsage()', () => {
        it('parses ps output correctly', async () => {
            mockExec('%CPU %MEM   RSS\n  2.5  1.2 102400');
            const usage = await getProcessResourceUsage(1234);
            expect(usage.cpuPercent).toBe(2.5);
            expect(usage.memoryPercent).toBe(1.2);
            expect(usage.memoryBytes).toBe(102400 * 1024);
        });

        it('returns zeros when ps fails', async () => {
            mockExec('', new Error('No such process'));
            const usage = await getProcessResourceUsage(99999);
            expect(usage.cpuPercent).toBe(0);
            expect(usage.memoryPercent).toBe(0);
            expect(usage.memoryBytes).toBe(0);
        });

        it('returns zeros when output has insufficient lines', async () => {
            mockExec('%CPU %MEM RSS');
            const usage = await getProcessResourceUsage(1234);
            expect(usage.cpuPercent).toBe(0);
            expect(usage.memoryPercent).toBe(0);
        });

        it('handles non-numeric values gracefully', async () => {
            mockExec('%CPU %MEM   RSS\n  N/A  N/A   0');
            const usage = await getProcessResourceUsage(1234);
            expect(usage.cpuPercent).toBe(0);
            expect(usage.memoryPercent).toBe(0);
        });
    });

    describe('detectGitInfo()', () => {
        it('returns empty object for empty cwd', async () => {
            const info = await detectGitInfo('');
            expect(info).toEqual({});
        });

        it('returns empty object when cwd is ~', async () => {
            const info = await detectGitInfo('~');
            expect(info).toEqual({});
        });

        it('parses repository and branch from git output', async () => {
            let callCount = 0;
            (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
                (_cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
                    callCount++;
                    if (callCount === 1) cb(null, '/home/user/my-repo\n', '');
                    else cb(null, 'feature/test\n', '');
                }
            );

            const info = await detectGitInfo('/home/user/my-repo');
            expect(info.repository).toBe('my-repo');
            expect(info.branch).toBe('feature/test');
        });

        it('returns empty object when git command fails', async () => {
            mockExec('', new Error('not a git repo'));
            const info = await detectGitInfo('/tmp');
            expect(info).toEqual({});
        });
    });

    describe('killProcess()', () => {
        it('returns true when process.kill succeeds', async () => {
            const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
            const result = await killProcess(1234, 'SIGTERM');
            expect(result).toBe(true);
            expect(killSpy).toHaveBeenCalledWith(1234, 'SIGTERM');
            killSpy.mockRestore();
        });

        it('returns false when process.kill throws (process not found)', async () => {
            const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
                throw new Error('ESRCH: No such process');
            });
            const result = await killProcess(99999, 'SIGKILL');
            expect(result).toBe(false);
            killSpy.mockRestore();
        });

        it('defaults to SIGTERM when no signal provided', async () => {
            const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
            const result = await killProcess(1234);
            expect(result).toBe(true);
            expect(killSpy).toHaveBeenCalledWith(1234, 'SIGTERM');
            killSpy.mockRestore();
        });
    });

    describe('discoverHomeDirs()', () => {
        it('includes current user home directory', () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
            (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);

            const dirs = discoverHomeDirs();
            expect(dirs.some(d => d.username === 'testuser' && d.homeDir === '/home/testuser')).toBe(true);
        });

        it('skips non-existent directories', () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
            (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);

            const dirs = discoverHomeDirs();
            expect(dirs).toHaveLength(0);
        });

        it('skips dot-prefixed entries', () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation((p: string) => {
                // Only /home exists and /home/user, skip /home/.hidden
                return p === '/home' || p === '/home/testuser' || p === '/home/user';
            });
            (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['.hidden', 'user']);

            const dirs = discoverHomeDirs();
            const hidden = dirs.find(d => d.username === '.hidden');
            expect(hidden).toBeUndefined();
        });

        it('de-duplicates home directories', () => {
            (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
            // Return testuser in /home/testuser to match the current user's home
            (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['testuser']);

            const dirs = discoverHomeDirs();
            const dupes = dirs.filter(d => d.homeDir === '/home/testuser');
            expect(dupes).toHaveLength(1);
        });
    });
});
