/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
    mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/docker/service', () => ({
    dockerService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/docker', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns docker snapshot on success', async () => {
        const snapshot = { containers: [], images: [], volumes: [] };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.containers).toEqual([]);
    });

    it('returns snapshot with containers', async () => {
        const snapshot = {
            containers: [{ id: 'abc123', name: 'web', status: 'running' }],
            images: [],
            volumes: [],
        };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await GET();
        const json = await res.json();
        expect(json.containers).toHaveLength(1);
        expect(json.containers[0].name).toBe('web');
    });

    it('returns 500 on service error', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('docker not running'));
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch docker snapshot');
    });
});
