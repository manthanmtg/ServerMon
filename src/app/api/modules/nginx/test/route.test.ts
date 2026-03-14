/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTestConfig } = vi.hoisted(() => ({
    mockTestConfig: vi.fn(),
}));

vi.mock('@/lib/nginx/service', () => ({
    nginxService: { testConfig: mockTestConfig },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';

describe('POST /api/modules/nginx/test', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns test result on success', async () => {
        const result = { success: true, output: 'nginx: configuration file test is successful' };
        mockTestConfig.mockResolvedValue(result);
        const res = await POST();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
    });

    it('returns test failure result', async () => {
        const result = { success: false, output: 'nginx: configuration file has errors' };
        mockTestConfig.mockResolvedValue(result);
        const res = await POST();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(false);
    });

    it('returns 500 when service throws', async () => {
        mockTestConfig.mockRejectedValue(new Error('spawn failed'));
        const res = await POST();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to test nginx config');
    });
});
