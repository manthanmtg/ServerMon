/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
    mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/hardware/service', () => ({
    hardwareService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/hardware', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns hardware snapshot on success', async () => {
        const snapshot = { cpu: { manufacturer: 'Intel' }, memory: { total: 16000 } };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.cpu.manufacturer).toBe('Intel');
    });

    it('returns snapshot with multiple components', async () => {
        const snapshot = { cpu: {}, memory: {}, storage: [], network: [] };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await GET();
        const json = await res.json();
        expect(json).toHaveProperty('cpu');
        expect(json).toHaveProperty('memory');
    });

    it('returns 500 on service error', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('dmidecode failed'));
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch hardware snapshot');
    });

    it('error response has expected structure', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('error'));
        const res = await GET();
        const json = await res.json();
        expect(Object.keys(json)).toContain('error');
    });
});
