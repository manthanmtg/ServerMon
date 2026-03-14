/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
    mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/network/service', () => ({
    networkService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/network', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns network snapshot on success', async () => {
        const snapshot = { interfaces: [], connections: [] };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.interfaces).toEqual([]);
    });

    it('returns snapshot with data', async () => {
        const snapshot = { interfaces: [{ name: 'eth0', speed: 1000 }], connections: [{ state: 'ESTABLISHED' }] };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await GET();
        const json = await res.json();
        expect(json.interfaces).toHaveLength(1);
        expect(json.connections).toHaveLength(1);
    });

    it('returns 500 on service error', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('network failure'));
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch network snapshot');
    });
});
