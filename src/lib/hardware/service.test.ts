/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { hardwareService } from './service';

// Mock child_process
vi.mock('node:child_process', () => ({
    execFile: vi.fn(),
}));

// Mock os
vi.mock('node:os', () => ({
    default: {
        cpus: vi.fn(),
        totalmem: vi.fn(),
        freemem: vi.fn(),
        release: vi.fn().mockReturnValue('5.15.0'),
        arch: vi.fn().mockReturnValue('x64'),
        hostname: vi.fn().mockReturnValue('test-host'),
        uptime: vi.fn().mockReturnValue(12345),
    },
    cpus: vi.fn(),
    totalmem: vi.fn(),
    freemem: vi.fn(),
    release: vi.fn().mockReturnValue('5.15.0'),
    arch: vi.fn().mockReturnValue('x64'),
    hostname: vi.fn().mockReturnValue('test-host'),
    uptime: vi.fn().mockReturnValue(12345),
    __esModule: true
}));

describe('HardwareService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('process', { ...process, platform: 'linux' });
        
        // Default OS mocks
        (os.cpus as unknown as ReturnType<typeof vi.fn>).mockReturnValue([{ model: 'Intel Core i7', speed: 2800 }]);
        (os.totalmem as unknown as ReturnType<typeof vi.fn>).mockReturnValue(16 * 1024 * 1024 * 1024);
        (os.freemem as unknown as ReturnType<typeof vi.fn>).mockReturnValue(8 * 1024 * 1024 * 1024);
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

    describe('getSnapshot (Linux)', () => {
        beforeEach(() => {
            vi.stubGlobal('process', { ...process, platform: 'linux' });
        });

        it('should return live snapshot with correctly parsed hardware data', async () => {
            mockExec({
                'thermal_zone0/temp': '45000\n',
                'dmidecode -t memory': 'Memory Device\nSize: 8 GB\nType: DDR4\nSpeed: 3200\nManufacturer: Crucial\n',
                'lsblk -Jb': JSON.stringify({
                    blockdevices: [
                        { name: 'sda', type: 'disk', size: '500107862016', model: 'Samsung SSD', serial: 'SN123', tran: 'sata' }
                    ]
                }),
                'lspci -vmm': 'Class: VGA compatible controller\nVendor: NVIDIA\nDevice: RTX 3080\n',
                'lsusb': 'Bus 001 Device 002: ID 1234:5678 Generic Keyboard\n'
            });

            const snapshot = await hardwareService.getSnapshot();

            expect(snapshot.source).toBe('live');
            expect(snapshot.cpu.manufacturer).toBe('Intel');
            expect(snapshot.cpuTemperature.main).toBe(45);
            expect(snapshot.memoryLayout).toHaveLength(1);
            expect(snapshot.memoryLayout[0].size).toBe(8192 * 1024 * 1024);
            expect(snapshot.disks).toHaveLength(1);
            expect(snapshot.disks[0].serialNum).toBe('SN123');
            expect(snapshot.gpus).toHaveLength(1);
            expect(snapshot.usb).toHaveLength(1);
            expect(snapshot.usb[0].name).toContain('Generic Keyboard');
        });

        it('should fallback to mock data if hardware detection fails completely', async () => {
            (os.cpus as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
            mockExec({
                'lsblk': new Error('lsblk not found')
            });

            const snapshot = await hardwareService.getSnapshot();
            expect(snapshot.source).toBe('mock');
        });
    });

    describe('getSnapshot (Darwin)', () => {
        beforeEach(() => {
            vi.stubGlobal('process', { ...process, platform: 'darwin' });
            (os.cpus as unknown as ReturnType<typeof vi.fn>).mockReturnValue([{ model: 'Apple M1', speed: 3200 }]);
        });

        it('should return live snapshot for macOS', async () => {
            mockExec({
                'diskutil list': '<string>/dev/disk0</string>\n',
                'system_profiler SPUSBDataType': '    Apple Internal Keyboard / Trackpad:\n'
            });

            const snapshot = await hardwareService.getSnapshot();

            expect(snapshot.source).toBe('live');
            expect(snapshot.cpu.manufacturer).toBe('Apple');
            expect(snapshot.disks).toHaveLength(1);
            expect(snapshot.disks[0].device).toBe('/dev/disk0');
            expect(snapshot.usb).toHaveLength(1);
            expect(snapshot.usb[0].name).toBe('Apple Internal Keyboard / Trackpad');
        });
    });
});
