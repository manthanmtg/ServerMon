/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { dockerService } from './service';

// Mock child_process
vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

// Mock fs
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
    },
    existsSync: vi.fn(),
    __esModule: true
}));

const { mockLean } = vi.hoisted(() => ({
    mockLean: vi.fn().mockResolvedValue({
        _id: 'mock-id',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
    }),
}));

// Mock db and models
vi.mock('@/lib/db', () => ({
    default: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/models/DockerAlert', () => ({
    default: {
        updateMany: vi.fn().mockResolvedValue({}),
        findOneAndUpdate: vi.fn().mockReturnValue({
            lean: mockLean,
        }),
    },
}));

vi.mock('@/models/DockerStatAggregate', () => ({
    default: {
        findOneAndUpdate: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({}),
    },
}));

vi.mock('@/lib/analytics', () => ({
    analyticsService: {
        track: vi.fn().mockResolvedValue({}),
    },
}));

describe('DockerService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('MONGO_URI', 'mongodb://localhost:27017/test');
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('SERVERMON_DOCKER_MOCK', '0');
        vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    const mockExec = (outputs: Record<string, string | Error>) => {
        (execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }).mockImplementation(
            (...args: unknown[]) => {
                const cmd = args[0] as string;
                const cmdArgs = args[1] as string[];
                const callback = args[args.length - 1] as (err: Error | null, result: { stdout: string; stderr: string }) => void;

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
            }
        );
    };

    describe('getSnapshot', () => {
        it('should return live snapshot when docker is available', async () => {
            mockExec({
                'ps -a': JSON.stringify({ ID: 'cont-1', Names: 'web-server', Image: 'nginx', State: 'running', Status: 'Up 1m', Command: 'nginx' }),
                'stats': JSON.stringify({ ID: 'cont-1', CPUPerc: '1.5%', MemPerc: '2.0%', MemUsage: '20MB / 1GB', BlockIO: '0B / 0B', NetIO: '0B / 0B' }),
                'images': JSON.stringify({ ID: 'img-1', Repository: 'nginx', Tag: 'latest', Size: '100MB' }),
                'volume ls': JSON.stringify({ Name: 'vol-1', Driver: 'local' }),
                'network ls': JSON.stringify({ ID: 'net-1', Name: 'bridge', Driver: 'bridge' }),
                'info': JSON.stringify({ Name: 'docker-host', ServerVersion: '20.10', OperatingSystem: 'Ubuntu' }),
                'system df': JSON.stringify({ Type: 'Images', Size: '100MB', Reclaimable: '0%' }),
                'events': JSON.stringify({ Action: 'start', Type: 'container', Actor: { ID: 'cont-1', Attributes: { name: 'web-server' } }, time: Date.now() / 1000 }),
                'inspect': JSON.stringify([{ Id: 'cont-1', Config: { Env: [] }, NetworkSettings: { Networks: { bridge: {} } }, State: { Restarting: false }, Mounts: [] }])
            });

            const snapshot = await dockerService.getSnapshot();

            expect(snapshot.source).toBe('docker');
            expect(snapshot.daemonReachable).toBe(true);
            expect(snapshot.containers).toHaveLength(1);
            expect(snapshot.containers[0].name).toBe('web-server');
            expect(snapshot.images).toHaveLength(1);
        });

        it('should fallback to mock mode if socket is missing', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const snapshot = await dockerService.getSnapshot();
            expect(snapshot.source).toBe('mock');
        });

        it('should generate alerts for stopped containers', async () => {
            mockExec({
                'ps -a': JSON.stringify({ ID: 'cont-1', Names: 'web-server', Image: 'nginx', State: 'exited', Status: 'Exited (1)', Command: 'nginx' }),
                'stats': JSON.stringify({ ID: 'cont-1', CPUPerc: '0%', MemPerc: '0%', MemUsage: '0B / 1GB', BlockIO: '0B / 0B', NetIO: '0B / 0B' }),
                'images': '',
                'volume ls': '',
                'network ls': '',
                'info': JSON.stringify({ Name: 'docker-host' }),
                'system df': '',
                'inspect': JSON.stringify([{ Id: 'cont-1', State: { Restarting: false } }])
            });

            const snapshot = await dockerService.getSnapshot();
            expect(snapshot.alerts).toHaveLength(1);
            expect(snapshot.alerts[0].title).toContain('stopped unexpectedly');
        });

        it('should handle daemon unreachable gracefully', async () => {
            (execFile as unknown as { mockImplementation: (fn: (...args: unknown[]) => void) => void }).mockImplementation((...args: unknown[]) => {
                const callback = args[args.length - 1] as (err: Error | null, result: { stdout: string; stderr: string }) => void;
                callback(new Error('Cannot connect to the Docker daemon'), { stdout: '', stderr: 'Cannot connect to the Docker daemon' });
            });

            const snapshot = await dockerService.getSnapshot();
            expect(snapshot.daemonReachable).toBe(false);
            expect(snapshot.alerts).toHaveLength(1);
            expect(snapshot.alerts[0].title).toBe('Docker daemon unreachable');
        });
    });

    describe('performAction', () => {
        it('should call docker command for live actions', async () => {
            mockExec({
                'start cont-1': '',
                'ps -a': '', // For snapshot refresh
                'stats': '',
                'images': '',
                'volume ls': '',
                'network ls': '',
                'info': '{}',
                'system df': '',
            });

            const result = await dockerService.performAction('cont-1', 'start');
            expect(result.ok).toBe(true);
            expect(execFile).toHaveBeenCalledWith('docker', expect.arrayContaining(['start', 'cont-1']), expect.any(Object), expect.any(Function));
        });

        it('should handle mock actions', async () => {
            vi.stubEnv('SERVERMON_DOCKER_MOCK', '1');
            const result = await dockerService.performAction('mock-api', 'stop');
            expect(result.ok).toBe(true);
        });
    });
});
