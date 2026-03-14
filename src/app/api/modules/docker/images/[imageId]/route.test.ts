/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRemoveImage } = vi.hoisted(() => ({
    mockRemoveImage: vi.fn(),
}));

vi.mock('@/lib/docker/service', () => ({
    dockerService: { removeImage: mockRemoveImage },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DELETE } from './route';

function makeContext(imageId: string) {
    return { params: Promise.resolve({ imageId }) };
}

describe('DELETE /api/modules/docker/images/[imageId]', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('removes an image successfully', async () => {
        mockRemoveImage.mockResolvedValue({ success: true });
        const res = await DELETE(new Request('http://localhost'), makeContext('sha256:abc'));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(mockRemoveImage).toHaveBeenCalledWith('sha256:abc');
    });

    it('passes correct imageId to service', async () => {
        mockRemoveImage.mockResolvedValue({ success: true });
        await DELETE(new Request('http://localhost'), makeContext('myimage:latest'));
        expect(mockRemoveImage).toHaveBeenCalledWith('myimage:latest');
    });

    it('returns 500 on service error', async () => {
        mockRemoveImage.mockRejectedValue(new Error('image in use'));
        const res = await DELETE(new Request('http://localhost'), makeContext('sha256:abc'));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to remove image');
    });
});
