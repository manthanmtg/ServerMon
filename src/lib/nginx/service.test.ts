/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
    readdir: vi.fn(),
    readFile: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    createLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

// Helper to mock execFile with a specific stdout/stderr
function mockExecSuccess(stdout: string, stderr = '') {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
            _cmd: unknown,
            _args: unknown,
            opts: unknown,
            callback: unknown
        ) => {
            const cb = (typeof opts === 'function' ? opts : callback) as (
                err: Error | null,
                result: { stdout: string; stderr: string }
            ) => void;
            cb(null, { stdout, stderr });
        }
    );
}

function mockExecFail(message: string, stderr = '', stdout = '') {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
            _cmd: unknown,
            _args: unknown,
            opts: unknown,
            callback: unknown
        ) => {
            const cb = (typeof opts === 'function' ? opts : callback) as (
                err: Error | null,
                result: { stdout: string; stderr: string }
            ) => void;
            const err = Object.assign(new Error(message), { stderr, stdout });
            cb(err, { stdout, stderr });
        }
    );
}

// Each test imports a fresh module via resetModules to avoid cached nginxChecked state
describe('nginxService', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    // ── getSnapshot — nginx unavailable (mock mode) ────────────────────────────

    describe('getSnapshot() — nginx unavailable', () => {
        it('returns mock data when nginx binary not found', async () => {
            mockExecFail('nginx: command not found');
            const { nginxService } = await import('./service');
            const snapshot = await nginxService.getSnapshot();

            expect(snapshot.source).toBe('mock');
            expect(snapshot.available).toBe(false);
            expect(snapshot.status.version).toBe('1.24.0');
            expect(snapshot.virtualHosts.length).toBeGreaterThan(0);
        });

        it('mock snapshot has required summary fields', async () => {
            mockExecFail('nginx: command not found');
            const { nginxService } = await import('./service');
            const snapshot = await nginxService.getSnapshot();

            expect(typeof snapshot.summary.totalVhosts).toBe('number');
            expect(typeof snapshot.summary.enabledVhosts).toBe('number');
            expect(typeof snapshot.summary.sslVhosts).toBe('number');
            expect(typeof snapshot.summary.totalRequests).toBe('number');
        });

        it('mock snapshot has a valid ISO timestamp', async () => {
            mockExecFail('nginx: command not found');
            const { nginxService } = await import('./service');
            const snapshot = await nginxService.getSnapshot();

            expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });
    });

    // ── getSnapshot — nginx available (linux, running) ────────────────────────

    describe('getSnapshot() — nginx available on linux', () => {
        it('returns live snapshot with parsed version and config path', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

            (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
                (_cmd: unknown, args: unknown, opts: unknown, callback: unknown) => {
                    const cb = (typeof opts === 'function' ? opts : callback) as (
                        err: Error | null,
                        result: { stdout: string; stderr: string }
                    ) => void;
                    const argList = args as string[];

                    // nginx -v → version
                    if (argList.includes('-v')) {
                        cb(null, { stdout: '', stderr: 'nginx version: nginx/1.22.1' });
                        return;
                    }
                    // nginx -t → config path
                    if (argList.includes('-t')) {
                        cb(null, { stdout: '', stderr: 'nginx: configuration file /etc/nginx/nginx.conf test is successful' });
                        return;
                    }
                    // systemctl is-active → active
                    if (argList.includes('is-active')) {
                        cb(null, { stdout: 'active\n', stderr: '' });
                        return;
                    }
                    // systemctl show → PID
                    if (argList.includes('--property=MainPID')) {
                        cb(null, { stdout: 'MainPID=1234\n', stderr: '' });
                        return;
                    }
                    cb(null, { stdout: '', stderr: '' });
                }
            );

            vi.mocked(readdir).mockResolvedValue([] as never);

            const { nginxService } = await import('./service');
            const snapshot = await nginxService.getSnapshot();

            expect(snapshot.source).toBe('live');
            expect(snapshot.available).toBe(true);
            expect(snapshot.status.running).toBe(true);
            expect(snapshot.status.pid).toBe(1234);

            Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        });
    });

    // ── getSnapshot — sites-available parsing ─────────────────────────────────

    describe('getSnapshot() — virtual host parsing', () => {
        it('parses sites-available configs into virtual hosts', async () => {
            (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
                (_cmd: unknown, args: unknown, opts: unknown, callback: unknown) => {
                    const cb = (typeof opts === 'function' ? opts : callback) as (
                        err: Error | null,
                        result: { stdout: string; stderr: string }
                    ) => void;
                    const argList = args as string[];
                    if (argList.includes('-v')) {
                        cb(null, { stdout: 'nginx version: nginx/1.24.0', stderr: '' });
                        return;
                    }
                    if (argList.includes('-t')) {
                        cb(null, { stdout: 'test is successful', stderr: '' });
                        return;
                    }
                    cb(null, { stdout: 'inactive\n', stderr: '' });
                }
            );

            vi.mocked(readdir).mockImplementation(async (path: unknown) => {
                if (String(path) === '/etc/nginx/sites-available') {
                    return ['mysite'] as never;
                }
                if (String(path) === '/etc/nginx/sites-enabled') {
                    return ['mysite'] as never;
                }
                return [] as never;
            });

            vi.mocked(readFile).mockResolvedValue(
                'server {\n  listen 443 ssl;\n  server_name example.com www.example.com;\n  root /var/www/html;\n  ssl_certificate /etc/ssl/cert.pem;\n  proxy_pass http://127.0.0.1:3000;\n}\n' as never
            );

            const { nginxService } = await import('./service');
            const snapshot = await nginxService.getSnapshot();

            expect(snapshot.virtualHosts).toHaveLength(1);
            const vhost = snapshot.virtualHosts[0];
            expect(vhost.name).toBe('mysite');
            expect(vhost.enabled).toBe(true);
            expect(vhost.sslEnabled).toBe(true);
            expect(vhost.serverNames).toContain('example.com');
            expect(vhost.serverNames).toContain('www.example.com');
            expect(vhost.listenPorts).toContain('443 ssl');
            expect(vhost.root).toBe('/var/www/html');
            expect(vhost.proxyPass).toBe('http://127.0.0.1:3000');
        });

        it('falls back to conf.d when sites-available is missing', async () => {
            (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
                (_cmd: unknown, args: unknown, opts: unknown, callback: unknown) => {
                    const cb = (typeof opts === 'function' ? opts : callback) as (
                        err: Error | null,
                        result: { stdout: string; stderr: string }
                    ) => void;
                    const argList = args as string[];
                    if (argList.includes('-v')) {
                        cb(null, { stdout: 'nginx version: nginx/1.24.0', stderr: '' });
                        return;
                    }
                    if (argList.includes('-t')) {
                        cb(null, { stdout: 'test is successful', stderr: '' });
                        return;
                    }
                    cb(null, { stdout: 'inactive\n', stderr: '' });
                }
            );

            vi.mocked(readdir).mockImplementation(async (path: unknown) => {
                if (String(path) === '/etc/nginx/sites-available') {
                    throw new Error('ENOENT: no such file or directory');
                }
                if (String(path) === '/etc/nginx/conf.d') {
                    return ['default.conf'] as never;
                }
                return [] as never;
            });

            vi.mocked(readFile).mockResolvedValue(
                'server {\n  listen 80;\n  server_name conf-site.example.com;\n}\n' as never
            );

            const { nginxService } = await import('./service');
            const snapshot = await nginxService.getSnapshot();

            expect(snapshot.virtualHosts).toHaveLength(1);
            expect(snapshot.virtualHosts[0].name).toBe('default.conf');
            expect(snapshot.virtualHosts[0].enabled).toBe(true);
            expect(snapshot.virtualHosts[0].serverNames).toContain('conf-site.example.com');
        });

        it('skips non-.conf files in conf.d fallback', async () => {
            (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
                (_cmd: unknown, args: unknown, opts: unknown, callback: unknown) => {
                    const cb = (typeof opts === 'function' ? opts : callback) as (
                        err: Error | null,
                        result: { stdout: string; stderr: string }
                    ) => void;
                    const argList = args as string[];
                    if (argList.includes('-v')) {
                        cb(null, { stdout: 'nginx version: nginx/1.24.0', stderr: '' });
                        return;
                    }
                    cb(null, { stdout: 'inactive\n', stderr: '' });
                }
            );

            vi.mocked(readdir).mockImplementation(async (path: unknown) => {
                if (String(path) === '/etc/nginx/sites-available') {
                    throw new Error('ENOENT');
                }
                if (String(path) === '/etc/nginx/conf.d') {
                    return ['site.conf', 'README', 'backup.bak'] as never;
                }
                return [] as never;
            });

            vi.mocked(readFile).mockResolvedValue(
                'server { listen 80; server_name test.com; }\n' as never
            );

            const { nginxService } = await import('./service');
            const snapshot = await nginxService.getSnapshot();

            // Only 1 .conf file should be parsed
            expect(snapshot.virtualHosts).toHaveLength(1);
            expect(snapshot.virtualHosts[0].name).toBe('site.conf');
        });
    });

    // ── testConfig ─────────────────────────────────────────────────────────────

    describe('testConfig()', () => {
        it('returns success=true when nginx -t succeeds', async () => {
            mockExecFail('nginx: command not found');
            const { nginxService } = await import('./service');

            // Now override execFile just for testConfig
            mockExecSuccess('nginx: configuration file /etc/nginx/nginx.conf test is successful\n');
            const result = await nginxService.testConfig();

            expect(result.success).toBe(true);
            expect(typeof result.output).toBe('string');
        });

        it('returns success=false when nginx -t fails with error (no stderr fallback)', async () => {
            mockExecFail('nginx: command not found');
            const { nginxService } = await import('./service');

            // Throw an error with NO stderr/stdout so execCmd re-throws and testConfig
            // catches it in its own catch block.
            (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
                (_cmd: unknown, _args: unknown, opts: unknown, callback: unknown) => {
                    const cb = (typeof opts === 'function' ? opts : callback) as (
                        err: Error | null,
                        result: { stdout: string; stderr: string }
                    ) => void;
                    // Error object has no stderr/stdout — forces execCmd to re-throw
                    const err = Object.assign(new Error('config test failed'), {
                        message: 'config test failed',
                    });
                    cb(err, { stdout: '', stderr: '' });
                }
            );
            const result = await nginxService.testConfig();

            expect(result.success).toBe(false);
        });

        it('returns success=true when stderr contains "test is successful"', async () => {
            mockExecFail('nginx: command not found');
            const { nginxService } = await import('./service');

            mockExecFail('test failed', 'nginx: configuration file /etc/nginx/nginx.conf test is successful');
            const result = await nginxService.testConfig();

            expect(result.success).toBe(true);
        });
    });

    // ── reloadNginx ────────────────────────────────────────────────────────────

    describe('reloadNginx()', () => {
        it('uses systemctl on linux and returns success', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

            mockExecFail('nginx: command not found');
            const { nginxService } = await import('./service');

            mockExecSuccess('');
            const result = await nginxService.reloadNginx();

            expect(result.success).toBe(true);
            expect(result.output).toBeTruthy();

            Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        });

        it('uses nginx -s reload on non-linux and returns success', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

            mockExecFail('nginx: command not found');
            const { nginxService } = await import('./service');

            mockExecSuccess('');
            const result = await nginxService.reloadNginx();

            expect(result.success).toBe(true);

            Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        });

        it('returns success=false with error message on failure', async () => {
            mockExecFail('nginx: command not found');
            const { nginxService } = await import('./service');

            // Error must have no stdout/no stderr so execCmd re-throws it and
            // reloadNginx's catch block sets success=false.
            (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
                (_cmd: unknown, _args: unknown, opts: unknown, callback: unknown) => {
                    const cb = (typeof opts === 'function' ? opts : callback) as (
                        err: Error | null,
                        result: { stdout: string; stderr: string }
                    ) => void;
                    const err = new Error('Reload command failed');
                    cb(err, { stdout: '', stderr: '' });
                }
            );
            const result = await nginxService.reloadNginx();

            expect(result.success).toBe(false);
            expect(result.output).toContain('Reload command failed');
        });
    });
});
