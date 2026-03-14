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

function makeContext(containerId: string) {
    return { params: Promise.resolve({ containerId }) };
}

describe('GET /api/modules/docker/[containerId]', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns container when found', async () => {
        const container = { id: 'abc123', name: 'web', status: 'running' };
        mockGetSnapshot.mockResolvedValue({ containers: [container] });
        const res = await GET(new Request('http://localhost'), makeContext('abc123'));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.container.name).toBe('web');
    });

    it('returns 404 when container not found', async () => {
        mockGetSnapshot.mockResolvedValue({ containers: [] });
        const res = await GET(new Request('http://localhost'), makeContext('notexist'));
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json.error).toBe('Container not found');
    });

    it('returns 404 for wrong container id', async () => {
        mockGetSnapshot.mockResolvedValue({
            containers: [{ id: 'abc123', name: 'web' }],
        });
        const res = await GET(new Request('http://localhost'), makeContext('xyz999'));
        expect(res.status).toBe(404);
    });

    it('returns 500 on service error', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('docker error'));
        const res = await GET(new Request('http://localhost'), makeContext('abc123'));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch container detail');
    });
});
