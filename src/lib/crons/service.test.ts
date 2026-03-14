/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';

// ── Mocks — must be declared before the module is imported ───────────────────

vi.mock('node:child_process', () => ({
    execFile: vi.fn((cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
        const cb = (typeof _opts === 'function' ? _opts : callback) as (
            err: Error | null,
            result: { stdout: string; stderr: string }
        ) => void;
        // Default: simulate "command not found" — makes crontab unavailable
        const err = Object.assign(new Error('not found'), {
            code: 127,
            stderr: `${String(cmd)}: command not found`,
        });
        cb(err, { stdout: '', stderr: `${String(cmd)}: command not found` });
    }),
    spawn: vi.fn(() => ({
        pid: 1234,
        unref: vi.fn(),
        on: vi.fn(),
    })),
}));

vi.mock('node:fs/promises', () => ({
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockRejectedValue(new Error('not found')),
    access: vi.fn().mockRejectedValue(new Error('no access')),
    unlink: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ mtime: new Date() }),
}));

vi.mock('node:fs', () => ({
    openSync: vi.fn().mockReturnValue(3),
    closeSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/logger', () => ({
    createLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

import { cronsService } from './service';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CronsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Restore default: crontab not available
        (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
                const cb = (typeof _opts === 'function' ? _opts : callback) as (
                    err: Error | null,
                    result: { stdout: string; stderr: string }
                ) => void;
                const err = Object.assign(new Error('not found'), {
                    code: 127,
                    stderr: `${String(cmd)}: command not found`,
                });
                cb(err, { stdout: '', stderr: `${String(cmd)}: command not found` });
            }
        );
    });

    // ── Service interface ────────────────────────────────────────────────────

    describe('service interface', () => {
        it('exports all expected methods', () => {
            expect(typeof cronsService.getSnapshot).toBe('function');
            expect(typeof cronsService.createJob).toBe('function');
            expect(typeof cronsService.updateJob).toBe('function');
            expect(typeof cronsService.deleteJob).toBe('function');
            expect(typeof cronsService.runJobNow).toBe('function');
            expect(typeof cronsService.getRunStatus).toBe('function');
            expect(typeof cronsService.listRuns).toBe('function');
        });
    });

    // ── getSnapshot (mock mode) ──────────────────────────────────────────────

    describe('getSnapshot() — mock mode (crontab unavailable)', () => {
        it('returns source="mock" and crontabAvailable=false', async () => {
            const snapshot = await cronsService.getSnapshot();
            expect(snapshot.source).toBe('mock');
            expect(snapshot.crontabAvailable).toBe(false);
        });

        it('returns a non-empty jobs array', async () => {
            const snapshot = await cronsService.getSnapshot();
            expect(snapshot.jobs.length).toBeGreaterThan(0);
        });

        it('every job has required fields', async () => {
            const snapshot = await cronsService.getSnapshot();
            for (const job of snapshot.jobs) {
                expect(typeof job.id).toBe('string');
                expect(job.id.length).toBeGreaterThan(0);
                expect(typeof job.command).toBe('string');
                expect(typeof job.expression).toBe('string');
                expect(typeof job.enabled).toBe('boolean');
                expect(Array.isArray(job.nextRuns)).toBe(true);
                expect(typeof job.description).toBe('string');
            }
        });

        it('summary counts match the jobs array', async () => {
            const snapshot = await cronsService.getSnapshot();
            const { summary, jobs } = snapshot;

            expect(summary.total).toBe(jobs.length);
            expect(summary.active).toBe(jobs.filter(j => j.enabled).length);
            expect(summary.disabled).toBe(jobs.filter(j => !j.enabled).length);
            expect(summary.active + summary.disabled).toBe(summary.total);
        });

        it('userCrons + systemCrons equals total', async () => {
            const snapshot = await cronsService.getSnapshot();
            const { summary, jobs } = snapshot;

            expect(summary.userCrons).toBe(jobs.filter(j => j.source === 'user').length);
            expect(summary.systemCrons).toBe(
                jobs.filter(j => j.source !== 'user').length
            );
        });

        it('returns a timestamp string in ISO format', async () => {
            const snapshot = await cronsService.getSnapshot();
            expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        it('returns systemDirs array', async () => {
            const snapshot = await cronsService.getSnapshot();
            expect(Array.isArray(snapshot.systemDirs)).toBe(true);
            expect(snapshot.systemDirs.length).toBeGreaterThan(0);
        });

        it('returns recentLogs array', async () => {
            const snapshot = await cronsService.getSnapshot();
            expect(Array.isArray(snapshot.recentLogs)).toBe(true);
            expect(snapshot.recentLogs.length).toBeGreaterThan(0);
        });

        it('every log entry has timestamp, command, and message fields', async () => {
            const snapshot = await cronsService.getSnapshot();
            for (const entry of snapshot.recentLogs) {
                expect(typeof entry.timestamp).toBe('string');
                expect(typeof entry.command).toBe('string');
                expect(typeof entry.message).toBe('string');
                expect(typeof entry.pid).toBe('number');
            }
        });

        it('active jobs have non-empty nextRuns arrays', async () => {
            const snapshot = await cronsService.getSnapshot();
            const activeJobs = snapshot.jobs.filter(j => j.enabled);
            for (const job of activeJobs) {
                // Jobs with "On reboot" description may have empty nextRuns
                if (job.description !== 'On reboot') {
                    expect(job.nextRuns.length).toBeGreaterThan(0);
                }
            }
        });

        it('nextRuns entries are valid ISO date strings', async () => {
            const snapshot = await cronsService.getSnapshot();
            for (const job of snapshot.jobs) {
                for (const run of job.nextRuns) {
                    expect(() => new Date(run)).not.toThrow();
                    expect(new Date(run).getTime()).toBeGreaterThan(Date.now() - 60_000);
                }
            }
        });

        it('job descriptions are human-readable strings', async () => {
            const snapshot = await cronsService.getSnapshot();
            for (const job of snapshot.jobs) {
                expect(typeof job.description).toBe('string');
                expect((job.description ?? '').length).toBeGreaterThan(0);
            }
        });

        it('job ids are consistent SHA-256 derived hashes', async () => {
            const snapshot = await cronsService.getSnapshot();
            // All IDs should be 12-char hex strings
            for (const job of snapshot.jobs) {
                expect(job.id).toMatch(/^[0-9a-f]{12}$/);
            }
        });

        it('all job ids within a snapshot are unique', async () => {
            const snapshot = await cronsService.getSnapshot();
            const ids = snapshot.jobs.map(j => j.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });
    });

    // ── createJob (mock mode) ────────────────────────────────────────────────

    describe('createJob() — mock mode', () => {
        it('returns success=true with a mock message', async () => {
            const result = await cronsService.createJob({
                minute: '0',
                hour: '2',
                dayOfMonth: '*',
                month: '*',
                dayOfWeek: '*',
                command: '/bin/backup.sh',
            });

            expect(result.success).toBe(true);
            expect(result.message).toContain('[mock]');
        });
    });

    // ── updateJob (mock mode) ────────────────────────────────────────────────

    describe('updateJob() — mock mode', () => {
        it('returns success=true with a mock message', async () => {
            const result = await cronsService.updateJob('some-id', { command: '/bin/new.sh' });

            expect(result.success).toBe(true);
            expect(result.message).toContain('[mock]');
        });
    });

    // ── deleteJob (mock mode) ────────────────────────────────────────────────

    describe('deleteJob() — mock mode', () => {
        it('returns success=true with a mock message', async () => {
            const result = await cronsService.deleteJob('some-id');

            expect(result.success).toBe(true);
            expect(result.message).toContain('[mock]');
        });
    });

    // ── listRuns ─────────────────────────────────────────────────────────────

    describe('listRuns()', () => {
        it('returns an array (empty when no runs recorded)', async () => {
            const runs = await cronsService.listRuns();
            expect(Array.isArray(runs)).toBe(true);
        });

        it('accepts an optional jobId filter', async () => {
            const runs = await cronsService.listRuns('job-123');
            expect(Array.isArray(runs)).toBe(true);
        });
    });

    // ── getRunStatus ─────────────────────────────────────────────────────────

    describe('getRunStatus()', () => {
        it('returns null for an unknown runId', async () => {
            const status = await cronsService.getRunStatus('nonexistent-run-id');
            expect(status).toBeNull();
        });
    });
});

// ── Real crontab parsing (isolated module reset) ─────────────────────────────

describe('CronsService — crontab parsing (real mode)', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('parses crontab lines into structured jobs', async () => {
        const { execFile: ef } = await import('node:child_process');

        // Make crontab -l succeed and return crontab content
        (ef as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (cmd: unknown, args: unknown, _opts: unknown, callback: unknown) => {
                const cb = (typeof _opts === 'function' ? _opts : callback) as (
                    err: Error | null,
                    result: { stdout: string; stderr: string }
                ) => void;

                const argList = args as string[];
                const fullCmd = `${String(cmd)} ${argList.join(' ')}`;

                if (fullCmd.includes('systemd-run')) {
                    // systemd-run not available
                    cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
                    return;
                }

                if (fullCmd.includes('crontab') && argList.includes('-l')) {
                    // Return a valid crontab
                    cb(null, {
                        stdout:
                            '0 * * * * /bin/hourly-task.sh\n' +
                            '*/5 * * * * /bin/every-five.sh\n' +
                            '0 2 * * * /bin/nightly-backup.sh --verbose\n' +
                            '@reboot /bin/on-boot.sh\n',
                        stderr: '',
                    });
                    return;
                }

                // journalctl for logs — fail gracefully
                if (fullCmd.includes('journalctl') || fullCmd.includes('grep')) {
                    cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
                    return;
                }

                cb(null, { stdout: '', stderr: '' });
            }
        );

        // Fresh import to get uncached crontabChecked state
        const { cronsService: freshService } = await import('./service');
        const snapshot = await freshService.getSnapshot();

        expect(snapshot.source).toBe('crontab');
        expect(snapshot.crontabAvailable).toBe(true);

        const commands = snapshot.jobs.map(j => j.command);
        expect(commands).toContain('/bin/hourly-task.sh');
        expect(commands).toContain('/bin/every-five.sh');
        expect(commands).toContain('/bin/nightly-backup.sh --verbose');
        expect(commands).toContain('/bin/on-boot.sh');
    });

    it('parses @reboot jobs as enabled with empty nextRuns', async () => {
        const { execFile: ef } = await import('node:child_process');

        (ef as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (cmd: unknown, args: unknown, _opts: unknown, callback: unknown) => {
                const cb = (typeof _opts === 'function' ? _opts : callback) as (
                    err: Error | null,
                    result: { stdout: string; stderr: string }
                ) => void;

                const argList = args as string[];
                const fullCmd = `${String(cmd)} ${argList.join(' ')}`;

                if (fullCmd.includes('crontab') && argList.includes('-l')) {
                    cb(null, { stdout: '@reboot /bin/startup.sh\n', stderr: '' });
                    return;
                }
                if (fullCmd.includes('systemd-run')) {
                    cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
                    return;
                }
                cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
            }
        );

        const { cronsService: freshService } = await import('./service');
        const snapshot = await freshService.getSnapshot();

        const rebootJob = snapshot.jobs.find(j => j.command === '/bin/startup.sh');
        expect(rebootJob).toBeDefined();
        expect(rebootJob!.enabled).toBe(true);
        expect(rebootJob!.nextRuns).toEqual([]);
        expect(rebootJob!.description).toBe('On reboot');
    });

    it('parses commented-out cron lines as disabled jobs', async () => {
        const { execFile: ef } = await import('node:child_process');

        (ef as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (cmd: unknown, args: unknown, _opts: unknown, callback: unknown) => {
                const cb = (typeof _opts === 'function' ? _opts : callback) as (
                    err: Error | null,
                    result: { stdout: string; stderr: string }
                ) => void;

                const argList = args as string[];
                const fullCmd = `${String(cmd)} ${argList.join(' ')}`;

                if (fullCmd.includes('crontab') && argList.includes('-l')) {
                    cb(null, {
                        stdout: '# 0 3 * * * /bin/disabled-job.sh\n',
                        stderr: '',
                    });
                    return;
                }
                if (fullCmd.includes('systemd-run')) {
                    cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
                    return;
                }
                cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
            }
        );

        const { cronsService: freshService } = await import('./service');
        const snapshot = await freshService.getSnapshot();

        const disabled = snapshot.jobs.find(j => j.command === '/bin/disabled-job.sh');
        expect(disabled).toBeDefined();
        expect(disabled!.enabled).toBe(false);
    });

    it('generates a correct human-readable description for well-known schedules', async () => {
        const { execFile: ef } = await import('node:child_process');

        (ef as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (cmd: unknown, args: unknown, _opts: unknown, callback: unknown) => {
                const cb = (typeof _opts === 'function' ? _opts : callback) as (
                    err: Error | null,
                    result: { stdout: string; stderr: string }
                ) => void;

                const argList = args as string[];
                const fullCmd = `${String(cmd)} ${argList.join(' ')}`;

                if (fullCmd.includes('crontab') && argList.includes('-l')) {
                    cb(null, {
                        stdout:
                            '* * * * * /bin/every-minute.sh\n' +
                            '0 * * * * /bin/every-hour.sh\n' +
                            '0 0 * * * /bin/daily-midnight.sh\n' +
                            '0 0 1 * * /bin/monthly.sh\n' +
                            '0 0 * * 0 /bin/weekly-sunday.sh\n',
                        stderr: '',
                    });
                    return;
                }
                if (fullCmd.includes('systemd-run')) {
                    cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
                    return;
                }
                cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
            }
        );

        const { cronsService: freshService } = await import('./service');
        const snapshot = await freshService.getSnapshot();

        const byCmd = Object.fromEntries(snapshot.jobs.map(j => [j.command, j]));

        expect(byCmd['/bin/every-minute.sh'].description).toBe('Every minute');
        expect(byCmd['/bin/every-hour.sh'].description).toBe('Every hour');
        expect(byCmd['/bin/daily-midnight.sh'].description).toBe('Daily at midnight');
        expect(byCmd['/bin/monthly.sh'].description).toBe('Monthly on the 1st');
        expect(byCmd['/bin/weekly-sunday.sh'].description).toBe('Weekly on Sunday');
    });

    it('expression field matches minute/hour/dom/month/dow components', async () => {
        const { execFile: ef } = await import('node:child_process');

        (ef as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (cmd: unknown, args: unknown, _opts: unknown, callback: unknown) => {
                const cb = (typeof _opts === 'function' ? _opts : callback) as (
                    err: Error | null,
                    result: { stdout: string; stderr: string }
                ) => void;

                const argList = args as string[];
                const fullCmd = `${String(cmd)} ${argList.join(' ')}`;

                if (fullCmd.includes('crontab') && argList.includes('-l')) {
                    cb(null, { stdout: '15 3 1 6 * /bin/test.sh\n', stderr: '' });
                    return;
                }
                if (fullCmd.includes('systemd-run')) {
                    cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
                    return;
                }
                cb(Object.assign(new Error('not found'), { stderr: 'not found' }), { stdout: '', stderr: 'not found' });
            }
        );

        const { cronsService: freshService } = await import('./service');
        const snapshot = await freshService.getSnapshot();

        const job = snapshot.jobs.find(j => j.command === '/bin/test.sh');
        expect(job).toBeDefined();
        expect(job!.minute).toBe('15');
        expect(job!.hour).toBe('3');
        expect(job!.dayOfMonth).toBe('1');
        expect(job!.month).toBe('6');
        expect(job!.dayOfWeek).toBe('*');
        expect(job!.expression).toBe('15 3 1 6 *');
    });
});
