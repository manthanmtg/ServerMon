/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
    getSession: vi.fn(),
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn().mockImplementation((body: unknown, init?: { status?: number }) => ({
            status: init?.status ?? 200,
            json: async () => body,
        })),
    },
}));

import { GET } from './route';
import { getSession } from '@/lib/session';

describe('GET /api/auth/me', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when no session exists', async () => {
        vi.mocked(getSession).mockResolvedValue(null);

        const req = new Request('http://localhost/api/auth/me');
        const response = await GET(req as never);
        const body = await response.json();

        expect(response.status).toBe(401);
        expect(body.error).toBe('Unauthorized');
    });

    it('returns 200 with the user from session when authenticated', async () => {
        const sessionPayload = {
            user: { id: 'user-123', username: 'admin', role: 'admin' },
            expires: new Date(Date.now() + 3600 * 1000),
        };
        vi.mocked(getSession).mockResolvedValue(sessionPayload as never);

        const req = new Request('http://localhost/api/auth/me');
        const response = await GET(req as never);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.user).toEqual({ id: 'user-123', username: 'admin', role: 'admin' });
    });

    it('returns 401 when getSession returns undefined', async () => {
        vi.mocked(getSession).mockResolvedValue(undefined as never);

        const req = new Request('http://localhost/api/auth/me');
        const response = await GET(req as never);

        expect(response.status).toBe(401);
    });
});
