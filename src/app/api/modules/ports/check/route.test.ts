/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCheckPort } = vi.hoisted(() => ({
    mockCheckPort: vi.fn(),
}));

vi.mock('@/lib/ports/service', () => ({
    portsService: { checkPort: mockCheckPort },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

function makeRequest(port?: string): NextRequest {
    const url = port
        ? `http://localhost/api/modules/ports/check?port=${port}`
        : `http://localhost/api/modules/ports/check`;
    return new NextRequest(url);
}

describe('GET /api/modules/ports/check', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns 400 when port parameter is missing', async () => {
        const res = await GET(makeRequest());
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('port parameter is required');
    });

    it('returns 400 for non-numeric port', async () => {
        const res = await GET(makeRequest('abc'));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('port must be between 1 and 65535');
    });

    it('returns 400 for port 0', async () => {
        const res = await GET(makeRequest('0'));
        expect(res.status).toBe(400);
    });

    it('returns 400 for port > 65535', async () => {
        const res = await GET(makeRequest('65536'));
        expect(res.status).toBe(400);
    });

    it('returns 400 for negative port', async () => {
        const res = await GET(makeRequest('-1'));
        expect(res.status).toBe(400);
    });

    it('returns check result for valid port 80', async () => {
        mockCheckPort.mockResolvedValue({ port: 80, open: true, process: 'nginx' });
        const res = await GET(makeRequest('80'));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.port).toBe(80);
        expect(json.open).toBe(true);
    });

    it('returns check result for port 65535', async () => {
        mockCheckPort.mockResolvedValue({ port: 65535, open: false });
        const res = await GET(makeRequest('65535'));
        expect(res.status).toBe(200);
        expect(mockCheckPort).toHaveBeenCalledWith(65535);
    });

    it('returns 500 on service error', async () => {
        mockCheckPort.mockRejectedValue(new Error('connection refused'));
        const res = await GET(makeRequest('8080'));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to check port');
    });
});
