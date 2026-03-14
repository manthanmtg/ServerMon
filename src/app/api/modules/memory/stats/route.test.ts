/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockGetDetailedStats } = vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDetailedStats: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/memory/service', () => ({
    memoryService: { getDetailedStats: mockGetDetailedStats },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';

describe('GET /api/modules/memory/stats', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns 401 when not authenticated', async () => {
        mockGetSession.mockResolvedValue(null);
        const res = await GET();
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.error).toBe('Unauthorized');
    });

    it('returns memory stats when authenticated', async () => {
        mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
        const stats = { total: 16000, used: 8000, free: 8000, swapTotal: 4000 };
        mockGetDetailedStats.mockResolvedValue(stats);
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.total).toBe(16000);
    });

    it('returns 500 on service error', async () => {
        mockGetSession.mockResolvedValue({ user: { role: 'user' } });
        mockGetDetailedStats.mockRejectedValue(new Error('failed'));
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch memory stats');
    });

    it('returns stats for non-admin user', async () => {
        mockGetSession.mockResolvedValue({ user: { role: 'viewer' } });
        mockGetDetailedStats.mockResolvedValue({ total: 8000 });
        const res = await GET();
        expect(res.status).toBe(200);
    });
});
