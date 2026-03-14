/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRenewCertificate } = vi.hoisted(() => ({
    mockRenewCertificate: vi.fn(),
}));

vi.mock('@/lib/certificates/service', () => ({
    certificatesService: { renewCertificate: mockRenewCertificate },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/modules/certificates/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/modules/certificates/renew', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renews certificate successfully', async () => {
        mockRenewCertificate.mockResolvedValue({ success: true, message: 'Renewed' });
        const res = await POST(makeRequest({ domain: 'example.com' }));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(mockRenewCertificate).toHaveBeenCalledWith('example.com');
    });

    it('returns 400 when domain is missing', async () => {
        const res = await POST(makeRequest({}));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('domain is required');
    });

    it('returns 400 when domain is not a string', async () => {
        const res = await POST(makeRequest({ domain: 123 }));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('domain is required');
    });

    it('returns 400 when domain is null', async () => {
        const res = await POST(makeRequest({ domain: null }));
        expect(res.status).toBe(400);
    });

    it('returns 500 on service error', async () => {
        mockRenewCertificate.mockRejectedValue(new Error('certbot failed'));
        const res = await POST(makeRequest({ domain: 'example.com' }));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to renew certificate');
    });
});
