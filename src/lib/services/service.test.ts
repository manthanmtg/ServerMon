/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { servicesService } from './service';
import connectDB from '@/lib/db';
import ServiceAlert from '@/models/ServiceAlert';

// Mock child_process
vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

// Mock Database
vi.mock('@/lib/db', () => ({
    default: vi.fn().mockResolvedValue(undefined),
    __esModule: true
}));

// Mock MongoDB Model
vi.mock('@/models/ServiceAlert', () => ({
    default: {
        findOneAndUpdate: vi.fn(),
        updateMany: vi.fn(),
        find: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([]),
        }),
    },
    __esModule: true
}));

// Mock systeminformation
vi.mock('systeminformation', () => ({
    mem: vi.fn().mockResolvedValue({ total: 16 * 1024 * 1024 * 1024 }),
}));

describe('servicesService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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

    describe('performAction', () => {
        it('should execute start action correctly', async () => {
            mockExec({ 'systemctl --version': 'systemd 245' });
            const result = await servicesService.performAction('test-service', 'start');
            expect(result.success).toBe(true);
        });

        it('should return failure if systemctl fails', async () => {
            mockExec({ 
                'systemctl --version': 'systemd 245',
                'systemctl start': new Error('Failed to start')
            });
            const result = await servicesService.performAction('test-service', 'start');
            expect(result.success).toBe(false);
            expect(result.message).toContain('Failed to start');
        });
    });

    describe('getServiceLogs', () => {
        it('should parse journalctl JSON output correctly', async () => {
            const mockLogs = [
                JSON.stringify({ __REALTIME_TIMESTAMP: '1625097600000000', PRIORITY: '6', MESSAGE: 'Log message 1' }),
                JSON.stringify({ __REALTIME_TIMESTAMP: '1625097660000000', PRIORITY: '3', MESSAGE: 'Error message' }),
            ].join('\n');

            mockExec({ 
                'systemctl --version': 'systemd 245',
                'journalctl': mockLogs 
            });

            const logs = await servicesService.getServiceLogs('test-service', 10);
            expect(logs).toHaveLength(2);
            expect(logs[0].message).toBe('Log message 1');
            expect(logs[1].priority).toBe('err');
        });
    });

    describe('getSnapshot', () => {
        it('should combine systemd data into a snapshot', async () => {
            mockExec({
                'systemctl --version': 'systemd 245',
                'list-units --type=service': 'test.service loaded active running Test Service\n',
                'show': [
                    'Id=test.service',
                    'Description=Test Service',
                    'LoadState=loaded',
                    'ActiveState=active',
                    'SubState=running',
                    'MainPID=1234',
                    'CPUUsageNSec=500000000',
                    'MemoryCurrent=104857600',
                    'UnitFileState=enabled'
                ].join('\n') + '\n\n',
                'list-timers': '2021-07-01 12:00:00 UTC  1h ago  test.timer  test.service\n'
            });

            const snapshot = await servicesService.getSnapshot();
            expect(snapshot.systemdAvailable).toBe(true);
            expect(snapshot.services).toHaveLength(1);
            expect(snapshot.services[0].name).toBe('test');
        });

        it('should fallback to mock data if systemd is unavailable', async () => {
            (execFile as unknown as { mockImplementation: (fn: (...a: unknown[]) => void) => void }).mockImplementation(
                (...args: unknown[]) => {
                const callback = args[3] as (err: Error | null, result: { stdout: string; stderr: string }) => void;
                callback(new Error('command not found'), { stdout: '', stderr: '' });
            });

            vi.resetModules();
            const { servicesService: FreshService } = await import('./service');
            
            const snapshot = await FreshService.getSnapshot();
            expect(snapshot.source).toBe('mock');
            expect(snapshot.services.length).toBeGreaterThan(0);
        });

        it('should perform alert evaluation for failed services', async () => {
            mockExec({
                'systemctl --version': 'systemd 245',
                'list-units --type=service': 'failed.service loaded failed failed Failed Service\n',
                'show': [
                    'Id=failed.service',
                    'Description=Failed Service',
                    'LoadState=loaded',
                    'ActiveState=failed',
                    'SubState=failed',
                    'MainPID=0',
                    'CPUUsageNSec=0',
                    'MemoryCurrent=0',
                    'UnitFileState=enabled'
                ].join('\n') + '\n\n',
            });

            await servicesService.getSnapshot();
            expect(connectDB).toHaveBeenCalled();
            expect(ServiceAlert.findOneAndUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ fingerprint: 'svc-failed:failed' }),
                expect.any(Object),
                expect.any(Object)
            );
        });
    });
});
