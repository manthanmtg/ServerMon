/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { createSocket } from 'node:dgram';
import { portsService } from './service';

// Mock child_process
vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

// Mock network APIs
vi.mock('node:net', () => ({
    createServer: vi.fn(),
}));

vi.mock('node:dgram', () => ({
    createSocket: vi.fn(),
}));

describe('portsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('process', { ...process, platform: 'linux' });
    });

    const mockExec = (outputs: Record<string, string | Error>) => {
        (execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }).mockImplementation(
            (...args: unknown[]) => {
            const cmd = args[0] as string;
            const cmdArgs = args[1] as string[];
            const callback = args[3] as (err: Error | null, result: { stdout: string; stderr: string }) => void;

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

    describe('getSnapshot (Linux)', () => {
        it('should parse ss output correctly on Linux', async () => {
            vi.stubGlobal('process', { ...process, platform: 'linux' });
            mockExec({
                'ss -tulnp': 'Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\ntcp LISTEN 0 128 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=1234,fd=6))\nudp UNCONN 0 0 0.0.0.0:53 0.0.0.0:* users:(("systemd-resolve",pid=567,fd=12))\n',
                'ufw status': 'Status: inactive\n'
            });

            const snapshot = await portsService.getSnapshot();
            
            expect(snapshot.source).toBe('live');
            expect(snapshot.listening).toHaveLength(2);
            expect(snapshot.listening[0].port).toBe(80);
            expect(snapshot.listening[0].process).toBe('nginx');
            expect(snapshot.listening[1].protocol).toBe('udp');
        });

        it('should parse ufw rules correctly', async () => {
            vi.stubGlobal('process', { ...process, platform: 'linux' });
            const mockUfw = [
                'Status: active',
                'Logging: on (low)',
                'Default: deny (incoming), allow (outgoing), disabled (routed)',
                'New profiles: skip',
                '',
                'To                         Action      From',
                '--                         ------      ----',
                '22/tcp                     ALLOW IN    Anywhere',
                '80/tcp                     ALLOW IN    Anywhere'
            ].join('\n');

            mockExec({
                'ss -tulnp': 'Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\ntcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=1))\n',
                'ufw status': mockUfw
            });

            const snapshot = await portsService.getSnapshot();
            expect(snapshot.firewall.enabled).toBe(true);
            expect(snapshot.firewall.rules.length).toBeGreaterThanOrEqual(2);
            expect(snapshot.firewall.rules[0].port).toBe('22/tcp');
        });
    });

    describe('getSnapshot (Darwin)', () => {
        it('should parse lsof output correctly on macOS', async () => {
            vi.stubGlobal('process', { ...process, platform: 'darwin' });
            mockExec({
                'lsof -i -P -n -sTCP:LISTEN': 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 1234 user 1u IPv4 0x123 0t0 TCP *:3000 (LISTEN)\n',
                'lsof -i UDP': 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 1234 user 2u IPv4 0x456 0t0 UDP *:3001\n'
            });

            const snapshot = await portsService.getSnapshot();
            expect(snapshot.listening).toHaveLength(2);
            expect(snapshot.listening[0].port).toBe(3000);
            expect(snapshot.listening[1].protocol).toBe('udp');
        });
    });

    describe('checkPort', () => {
        it('should return available: true if port is free', async () => {
            const mockServer = {
                once: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
                    if (event === 'listening') setTimeout(cb, 0);
                }),
                listen: vi.fn(),
                close: vi.fn((cb: (...a: unknown[]) => void) => cb()),
            };
            (createServer as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockServer);

            const mockSocket = {
                once: vi.fn(),
                bind: vi.fn((port, cb) => cb()),
                close: vi.fn(),
            };
            (createSocket as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockSocket);

            const result = await portsService.checkPort(9999);
            expect(result.available).toBe(true);
        });

        it('should return available: false if port is occupied (TCP)', async () => {
            const mockServer = {
                once: vi.fn((event, cb) => {
                    if (event === 'error') setTimeout(() => cb({ code: 'EADDRINUSE' }), 0);
                }),
                listen: vi.fn(),
            };
            (createServer as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockServer);

            const result = await portsService.checkPort(80);
            expect(result.available).toBe(false);
        });
    });
});
