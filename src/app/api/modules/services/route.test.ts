/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
    mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/services/service', () => ({
    servicesService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/services', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns services snapshot on success', async () => {
        const snapshot = { services: [{ name: 'nginx', status: 'active' }] };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.services).toHaveLength(1);
    });

    it('returns empty services list', async () => {
        mockGetSnapshot.mockResolvedValue({ services: [] });
        const res = await GET();
        const json = await res.json();
        expect(json.services).toEqual([]);
    });

    it('returns 500 on service error', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('systemctl failed'));
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch services snapshot');
    });
});
