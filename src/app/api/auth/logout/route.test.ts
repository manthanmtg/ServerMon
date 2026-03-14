/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
    logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn().mockImplementation((body: unknown, init?: { status?: number }) => ({
            status: init?.status ?? 200,
            json: async () => body,
        })),
    },
}));

import { POST, GET } from './route';
import { logout } from '@/lib/session';

describe('POST /api/auth/logout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls logout and returns success: true', async () => {
        const req = new Request('http://localhost/api/auth/logout', { method: 'POST' });
        const response = await POST(req as never);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(logout).toHaveBeenCalledOnce();
    });

    it('returns 500 when logout throws', async () => {
        vi.mocked(logout).mockRejectedValueOnce(new Error('Cookie error'));

        const req = new Request('http://localhost/api/auth/logout', { method: 'POST' });
        const response = await POST(req as never);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe('Cookie error');
    });
});

describe('GET /api/auth/logout', () => {
    it('returns 405 Method Not Allowed', async () => {
        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(405);
        expect(body.error).toBeDefined();
    });
});
