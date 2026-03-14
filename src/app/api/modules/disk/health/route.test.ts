/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDiskLayout, mockBlockDevices } = vi.hoisted(() => ({
    mockDiskLayout: vi.fn(),
    mockBlockDevices: vi.fn(),
}));

vi.mock('systeminformation', () => ({
    default: {
        diskLayout: mockDiskLayout,
        blockDevices: mockBlockDevices,
    },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/disk/health', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns disk layout and block devices', async () => {
        const layout = [{ device: '/dev/sda', type: 'SSD', size: 500000 }];
        const devices = [{ name: 'sda', type: 'disk' }];
        mockDiskLayout.mockResolvedValue(layout);
        mockBlockDevices.mockResolvedValue(devices);

        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.layout).toEqual(layout);
        expect(json.devices).toEqual(devices);
    });

    it('returns empty arrays when no disks', async () => {
        mockDiskLayout.mockResolvedValue([]);
        mockBlockDevices.mockResolvedValue([]);
        const res = await GET();
        const json = await res.json();
        expect(json.layout).toEqual([]);
        expect(json.devices).toEqual([]);
    });

    it('returns 500 when systeminformation throws', async () => {
        mockDiskLayout.mockRejectedValue(new Error('disk error'));
        mockBlockDevices.mockResolvedValue([]);
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch disk health');
    });

    it('returns 500 when blockDevices throws', async () => {
        mockDiskLayout.mockResolvedValue([]);
        mockBlockDevices.mockRejectedValue(new Error('block device error'));
        const res = await GET();
        expect(res.status).toBe(500);
    });
});
