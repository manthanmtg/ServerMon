/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConnectDB, mockFindById, mockFindByIdAndUpdate, mockCreate } = vi.hoisted(() => ({
    mockConnectDB: vi.fn().mockResolvedValue(undefined),
    mockFindById: vi.fn(),
    mockFindByIdAndUpdate: vi.fn(),
    mockCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/models/DiskSettings', () => ({
    default: {
        findById: mockFindById,
        create: mockCreate,
        findByIdAndUpdate: mockFindByIdAndUpdate,
    },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GET, PUT } from './route';
import { NextRequest } from 'next/server';

function makePutRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/modules/disk/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('GET /api/modules/disk/settings', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns existing settings', async () => {
        const settings = { _id: 'disk-settings', unitSystem: 'binary' };
        mockFindById.mockReturnValue({ lean: () => Promise.resolve(settings) });
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.settings.unitSystem).toBe('binary');
    });

    it('creates default settings when none exist', async () => {
        const settings = { _id: 'disk-settings', unitSystem: 'binary' };
        mockFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
        mockCreate.mockResolvedValue({ toObject: () => settings });
        const res = await GET();
        expect(res.status).toBe(200);
        expect(mockCreate).toHaveBeenCalledWith({ _id: 'disk-settings', unitSystem: 'binary' });
    });

    it('returns 500 on error', async () => {
        mockFindById.mockReturnValue({ lean: () => Promise.reject(new Error('db error')) });
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch settings');
    });
});

describe('PUT /api/modules/disk/settings', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('updates unitSystem to decimal', async () => {
        const existingSettings = { _id: 'disk-settings', unitSystem: 'binary' };
        mockFindById.mockReturnValue({ lean: () => Promise.resolve(existingSettings) });
        const updatedSettings = { _id: 'disk-settings', unitSystem: 'decimal' };
        mockFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.resolve(updatedSettings) });

        const res = await PUT(makePutRequest({ unitSystem: 'decimal' }));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.settings.unitSystem).toBe('decimal');
    });

    it('updates unitSystem to binary', async () => {
        const existingSettings = { _id: 'disk-settings', unitSystem: 'decimal' };
        mockFindById.mockReturnValue({ lean: () => Promise.resolve(existingSettings) });
        mockFindByIdAndUpdate.mockReturnValue({ lean: () => Promise.resolve({ unitSystem: 'binary' }) });

        const res = await PUT(makePutRequest({ unitSystem: 'binary' }));
        expect(res.status).toBe(200);
    });

    it('returns 400 for invalid unitSystem', async () => {
        const existingSettings = { _id: 'disk-settings', unitSystem: 'binary' };
        mockFindById.mockReturnValue({ lean: () => Promise.resolve(existingSettings) });
        const res = await PUT(makePutRequest({ unitSystem: 'invalid' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 on validation error', async () => {
        mockFindById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'disk-settings' }) });
        const res = await PUT(makePutRequest({ unitSystem: 'wrong' }));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json).toHaveProperty('error');
    });
});
