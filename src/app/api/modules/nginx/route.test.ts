/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
    mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/nginx/service', () => ({
    nginxService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/nginx', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns nginx snapshot on success', async () => {
        const snapshot = { status: 'running', sites: [] };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toEqual(snapshot);
    });

    it('returns 500 when service throws', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('nginx not found'));
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch nginx snapshot');
    });

    it('returns structured JSON on success', async () => {
        mockGetSnapshot.mockResolvedValue({ status: 'stopped', version: '1.24.0' });
        const res = await GET();
        const json = await res.json();
        expect(json.status).toBe('stopped');
        expect(json.version).toBe('1.24.0');
    });
});
