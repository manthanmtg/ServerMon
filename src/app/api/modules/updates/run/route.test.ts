/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSession, mockTriggerUpdate } = vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockTriggerUpdate: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getSession: mockGetSession }));
vi.mock('@/lib/updates/system-service', () => ({
    systemUpdateService: { triggerUpdate: mockTriggerUpdate },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

describe('POST /api/modules/updates/run', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns 401 when not authenticated', async () => {
        mockGetSession.mockResolvedValue(null);
        const res = await POST();
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.error).toBe('Unauthorized');
    });

    it('returns success when update triggered', async () => {
        mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
        mockTriggerUpdate.mockResolvedValue({ success: true, message: 'Update started', pid: 1234 });
        const res = await POST();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.pid).toBe(1234);
    });

    it('returns 500 when update trigger fails', async () => {
        mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
        mockTriggerUpdate.mockResolvedValue({ success: false, message: 'Already running' });
        const res = await POST();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error).toBe('Already running');
    });

    it('returns 500 when service throws', async () => {
        mockGetSession.mockResolvedValue({ user: { role: 'admin' } });
        mockTriggerUpdate.mockRejectedValue(new Error('unexpected'));
        const res = await POST();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Internal server error while triggering update');
    });
});
