/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReloadNginx } = vi.hoisted(() => ({
    mockReloadNginx: vi.fn(),
}));

vi.mock('@/lib/nginx/service', () => ({
    nginxService: { reloadNginx: mockReloadNginx },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

describe('POST /api/modules/nginx/reload', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns reload result on success', async () => {
        const result = { success: true, message: 'nginx reloaded' };
        mockReloadNginx.mockResolvedValue(result);
        const res = await POST();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
    });

    it('returns reload failure result', async () => {
        const result = { success: false, message: 'reload failed' };
        mockReloadNginx.mockResolvedValue(result);
        const res = await POST();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(false);
    });

    it('returns 500 when service throws', async () => {
        mockReloadNginx.mockRejectedValue(new Error('permission denied'));
        const res = await POST();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to reload nginx');
    });
});
