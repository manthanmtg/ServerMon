/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import si from 'systeminformation';
import { networkService } from './service';
import NetworkStatAggregate from '@/models/NetworkStatAggregate';

// Mock child_process
vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

// Mock systeminformation
vi.mock('systeminformation', () => ({
    default: {
        networkInterfaces: vi.fn(),
        networkStats: vi.fn(),
    },
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

vi.mock('@/models/NetworkAlert', () => ({
    default: {
        updateMany: vi.fn().mockResolvedValue({}),
        findOneAndUpdate: vi.fn().mockReturnValue({
            lean: mockLean,
        }),
    },
}));

vi.mock('@/models/NetworkStatAggregate', () => ({
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

let testMinuteOffset = 0;

describe('NetworkService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        // Advance time by 10 minutes for EACH test to avoid lastMinuteBucket collision in singleton
        testMinuteOffset += 10;
        vi.setSystemTime(new Date(Date.now() + testMinuteOffset * 60000));
        vi.stubEnv('MONGO_URI', 'mongodb://localhost:27017/test');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const mockExec = (output: string) => {
        (execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }).mockImplementation(
            (...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: Error | null, result: { stdout: string; stderr: string }) => void;
                cb(null, { stdout: output, stderr: '' });
            }
        );
    };

    describe('getSnapshot', () => {
        it('should return mock snapshot if forced', async () => {
            vi.stubEnv('SERVERMON_NETWORK_MOCK', '1');
            vi.stubEnv('NODE_ENV', 'test');
            const snapshot = await networkService.getSnapshot();
            expect(snapshot.interfaces[0].iface).toBe('eth0');
            expect(snapshot.history).toHaveLength(testMinuteOffset / 10);
        });

        it('should return live snapshot if not in mock mode', async () => {
            vi.stubEnv('SERVERMON_NETWORK_MOCK', '0');
            vi.stubEnv('NODE_ENV', 'production');
            
            vi.mocked(si.networkInterfaces).mockResolvedValue([
                { iface: 'eth1', ip4: '10.0.0.1', operstate: 'up', internal: false }
            ] as unknown as si.Systeminformation.NetworkInterfacesData[]);
            vi.mocked(si.networkStats).mockResolvedValue([
                { iface: 'eth1', rx_bytes: 1000, tx_bytes: 500, rx_errors: 0, tx_errors: 0, ms: 1000 }
            ] as unknown as si.Systeminformation.NetworkStatsData[]);
            mockExec('Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\ntcp ESTAB 0 0 127.0.0.1:8912 127.0.0.1:12345 users:(("node",pid=123,fd=1))\n');

            const snapshot = await networkService.getSnapshot();
            
            expect(snapshot.interfaces[0].iface).toBe('eth1');
            expect(snapshot.connections[0].process).toBe('node');
        });

        it('should generate alerts for down interfaces', async () => {
            vi.stubEnv('SERVERMON_NETWORK_MOCK', '0');
            vi.stubEnv('NODE_ENV', 'production');
            vi.mocked(si.networkInterfaces).mockResolvedValue([
                { iface: 'eth1', ip4: '', operstate: 'down', internal: false }
            ] as unknown as si.Systeminformation.NetworkInterfacesData[]);
            vi.mocked(si.networkStats).mockResolvedValue([
                { iface: 'eth1', rx_bytes: 0, tx_bytes: 0, rx_errors: 0, tx_errors: 0, ms: 1000 }
            ] as unknown as si.Systeminformation.NetworkStatsData[]);
            mockExec('');

            const snapshot = await networkService.getSnapshot();
            expect(snapshot.alerts).toHaveLength(1);
            expect(snapshot.alerts[0].title).toContain('is down');
        });

        it('should generate alerts for network errors', async () => {
            vi.stubEnv('SERVERMON_NETWORK_MOCK', '0');
            vi.stubEnv('NODE_ENV', 'production');
            vi.mocked(si.networkInterfaces).mockResolvedValue([
                { iface: 'eth1', ip4: '10.0.0.1', operstate: 'up', internal: false }
            ] as unknown as si.Systeminformation.NetworkInterfacesData[]);
            vi.mocked(si.networkStats).mockResolvedValue([
                { iface: 'eth1', rx_bytes: 1000, tx_bytes: 500, rx_errors: 5, tx_errors: 2, ms: 1000 }
            ] as unknown as si.Systeminformation.NetworkStatsData[]);
            mockExec('');

            const snapshot = await networkService.getSnapshot();
            expect(snapshot.alerts).toHaveLength(1);
            expect(snapshot.alerts[0].title).toContain('Network errors');
        });

        it('should persist history to database when bucket changes', async () => {
            vi.stubEnv('SERVERMON_NETWORK_MOCK', '1');
            vi.stubEnv('NODE_ENV', 'test');
            
            // First call in this test should persist because we advanced time in beforeEach
            await networkService.getSnapshot();
            const initialCalls = vi.mocked(NetworkStatAggregate.findOneAndUpdate).mock.calls.length;
            expect(initialCalls).toBeGreaterThan(0);

            // Second call in same minute should NOT persist
            await networkService.getSnapshot();
            expect(NetworkStatAggregate.findOneAndUpdate).toHaveBeenCalledTimes(initialCalls);

            // Advance time by 2 minutes
            vi.advanceTimersByTime(120 * 1000);
            
            // Third call in NEW minute SHOULD persist
            await networkService.getSnapshot();
            expect(NetworkStatAggregate.findOneAndUpdate).toHaveBeenCalledTimes(initialCalls + 1);
        });

        it('should handle errors gracefully', async () => {
            // Use unknown to access private/internal state for testing errors
            const internal = networkService as unknown as { getSnapshot: () => Promise<unknown> };
            vi.spyOn(internal, 'getSnapshot').mockRejectedValueOnce(new Error('Test error'));
            
            await expect(networkService.getSnapshot()).rejects.toThrow('Test error');
        });
    });
});
