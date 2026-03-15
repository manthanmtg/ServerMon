/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFind, mockCountDocuments } = vi.hoisted(() => ({
    mockFind: vi.fn(),
    mockCountDocuments: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/EndpointExecutionLog', () => ({
    default: {
        find: mockFind,
        countDocuments: mockCountDocuments,
    },
}));

import { GET } from './route';

function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
}

function makeRequest(params: Record<string, string> = {}): NextRequest {
    const url = new URL('http://localhost/api/modules/endpoints/ep-1/logs');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return new NextRequest(url.toString());
}

describe('GET /api/modules/endpoints/[id]/logs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const chainable = {
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([]),
        };
        mockFind.mockReturnValue(chainable);
        mockCountDocuments.mockResolvedValue(0);
    });

    it('returns logs and total on success', async () => {
        const logs = [{ _id: 'log-1', statusCode: 200, duration: 100 }];
        mockFind.mockReturnValue({
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(logs),
        });
        mockCountDocuments.mockResolvedValue(1);

        const res = await GET(makeRequest(), makeContext('ep-1'));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.logs).toHaveLength(1);
        expect(json.total).toBe(1);
    });

    it('filters by status=success', async () => {
        await GET(makeRequest({ status: 'success' }), makeContext('ep-1'));
        expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
            endpointId: 'ep-1',
            statusCode: { $gte: 200, $lt: 300 },
        }));
    });

    it('filters by status=error', async () => {
        await GET(makeRequest({ status: 'error' }), makeContext('ep-1'));
        expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
            endpointId: 'ep-1',
            statusCode: { $gte: 400 },
        }));
    });

    it('caps limit at 100', async () => {
        const chainable = {
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([]),
        };
        mockFind.mockReturnValue(chainable);
        await GET(makeRequest({ limit: '999' }), makeContext('ep-1'));
        expect(chainable.limit).toHaveBeenCalledWith(100);
    });

    it('returns 500 on db error', async () => {
        mockFind.mockReturnValue({
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            lean: vi.fn().mockRejectedValue(new Error('db error')),
        });
        const res = await GET(makeRequest(), makeContext('ep-1'));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch execution logs');
    });
});
