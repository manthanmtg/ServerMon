/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot } = vi.hoisted(() => ({
    mockGetSnapshot: vi.fn(),
}));

vi.mock('@/lib/updates/service', () => ({
    updateService: { getSnapshot: mockGetSnapshot },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, POST } from './route';

function makeRequest(body: unknown = {}): Request {
    return new Request('http://localhost/api/modules/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('GET /api/modules/updates', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns updates snapshot', async () => {
        const snapshot = { available: 5, packages: [] };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.available).toBe(5);
    });

    it('returns 500 on service error', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('apt unavailable'));
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch updates');
    });
});

describe('POST /api/modules/updates', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns snapshot without force flag', async () => {
        const snapshot = { available: 3 };
        mockGetSnapshot.mockResolvedValue(snapshot);
        const res = await POST(makeRequest({}));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.available).toBe(3);
        expect(mockGetSnapshot).toHaveBeenCalledWith(false);
    });

    it('passes force=true when provided', async () => {
        mockGetSnapshot.mockResolvedValue({ available: 0 });
        const res = await POST(makeRequest({ force: true }));
        expect(res.status).toBe(200);
        expect(mockGetSnapshot).toHaveBeenCalledWith(true);
    });

    it('handles invalid JSON body gracefully', async () => {
        mockGetSnapshot.mockResolvedValue({ available: 0 });
        const req = new Request('http://localhost/api/modules/updates', {
            method: 'POST',
            body: 'not-json',
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(mockGetSnapshot).toHaveBeenCalledWith(false);
    });

    it('returns 500 on service error', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('network error'));
        const res = await POST(makeRequest({}));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to trigger update check');
    });
});
