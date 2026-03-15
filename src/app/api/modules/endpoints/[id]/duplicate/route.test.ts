/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockFindById, mockFindOne, mockCreate } = vi.hoisted(() => ({
    mockFindById: vi.fn(),
    mockFindOne: vi.fn(),
    mockCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/CustomEndpoint', () => ({
    default: {
        findById: mockFindById,
        findOne: mockFindOne,
        create: mockCreate,
    },
}));

import { POST } from './route';

function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
}

const mockEndpoint = {
    _id: 'ep-1',
    name: 'My Endpoint',
    slug: 'my-endpoint',
    method: 'GET',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: 'echo hello',
    enabled: true,
    tags: ['monitoring'],
    envVars: {},
    auth: null,
    timeout: 30,
    responseHeaders: {},
    logicConfig: undefined,
    webhookConfig: undefined,
    description: 'Test',
};

describe('POST /api/modules/endpoints/[id]/duplicate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindOne.mockResolvedValue(null); // no slug conflict by default
        mockCreate.mockResolvedValue({
            ...mockEndpoint,
            _id: 'ep-2',
            name: 'My Endpoint (Copy)',
            slug: 'my-endpoint-copy',
            enabled: false,
            toObject: () => ({ _id: 'ep-2', name: 'My Endpoint (Copy)', slug: 'my-endpoint-copy' }),
        });
    });

    it('duplicates endpoint successfully with 201', async () => {
        mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockEndpoint) });
        const res = await POST(new NextRequest('http://localhost'), makeContext('ep-1'));
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.name).toBe('My Endpoint (Copy)');
    });

    it('returns 404 when source not found', async () => {
        mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
        const res = await POST(new NextRequest('http://localhost'), makeContext('ep-1'));
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json.error).toBe('Endpoint not found');
    });

    it('increments slug suffix when copy already exists', async () => {
        mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockEndpoint) });
        // First findOne (for 'my-endpoint-copy') returns something => conflict
        // Second findOne (for 'my-endpoint-copy-2') returns null => no conflict
        mockFindOne
            .mockResolvedValueOnce({ slug: 'my-endpoint-copy' })
            .mockResolvedValueOnce(null);

        await POST(new NextRequest('http://localhost'), makeContext('ep-1'));
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ slug: 'my-endpoint-copy-2' })
        );
    });

    it('creates duplicate with enabled=false', async () => {
        mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockEndpoint) });
        await POST(new NextRequest('http://localhost'), makeContext('ep-1'));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('returns 500 on db error', async () => {
        mockFindById.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('db error')) });
        const res = await POST(new NextRequest('http://localhost'), makeContext('ep-1'));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to duplicate endpoint');
    });
});
