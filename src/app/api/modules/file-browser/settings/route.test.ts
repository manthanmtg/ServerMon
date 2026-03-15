/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
    mockFindById,
    mockCreate,
    mockFindByIdAndUpdate,
    mockDefaultShortcuts,
    mockResolveBrowserPath,
} = vi.hoisted(() => ({
    mockFindById: vi.fn(),
    mockCreate: vi.fn(),
    mockFindByIdAndUpdate: vi.fn(),
    mockDefaultShortcuts: vi.fn(),
    mockResolveBrowserPath: vi.fn((p: string) => p),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/FileBrowserSettings', () => ({
    default: {
        findById: mockFindById,
        create: mockCreate,
        findByIdAndUpdate: mockFindByIdAndUpdate,
    },
}));
vi.mock('@/modules/file-browser/lib/file-browser', () => ({
    defaultShortcuts: mockDefaultShortcuts,
    resolveBrowserPath: mockResolveBrowserPath,
}));

import { GET, PUT } from './route';

const mockSettings = {
    _id: 'file-browser-settings',
    shortcuts: [{ id: 'home', label: 'Home', path: '/home/user' }],
    defaultPath: '/home/user',
    editorMaxBytes: 1048576,
    previewMaxBytes: 524288,
};

describe('GET /api/modules/file-browser/settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDefaultShortcuts.mockReturnValue([]);
    });

    it('returns existing settings', async () => {
        mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockSettings) });
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.settings._id).toBe('file-browser-settings');
    });

    it('creates default settings when none exist', async () => {
        mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
        const createdDoc = { ...mockSettings, toObject: () => mockSettings };
        mockCreate.mockResolvedValue(createdDoc);
        const res = await GET();
        expect(res.status).toBe(200);
        expect(mockCreate).toHaveBeenCalled();
    });

    it('returns 500 on db error', async () => {
        mockFindById.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('db error')) });
        const res = await GET();
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to fetch settings');
    });
});

describe('PUT /api/modules/file-browser/settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDefaultShortcuts.mockReturnValue([]);
        mockResolveBrowserPath.mockImplementation((p: string) => p);
        // ensureSettings success by default
        mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockSettings) });
    });

    it('updates shortcuts', async () => {
        const updated = { ...mockSettings, shortcuts: [{ id: 'new', label: 'New', path: '/new' }] };
        mockFindByIdAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) });
        const req = new NextRequest('http://localhost/api/modules/file-browser/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shortcuts: [{ id: 'new', label: 'New', path: '/new' }] }),
        });
        const res = await PUT(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.settings.shortcuts).toHaveLength(1);
    });

    it('updates defaultPath', async () => {
        const updated = { ...mockSettings, defaultPath: '/new/path' };
        mockFindByIdAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) });
        const req = new NextRequest('http://localhost/api/modules/file-browser/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultPath: '/new/path' }),
        });
        const res = await PUT(req);
        expect(res.status).toBe(200);
    });

    it('updates editorMaxBytes and previewMaxBytes', async () => {
        const updated = { ...mockSettings, editorMaxBytes: 65536, previewMaxBytes: 65536 };
        mockFindByIdAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(updated) });
        const req = new NextRequest('http://localhost/api/modules/file-browser/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ editorMaxBytes: 65536, previewMaxBytes: 65536 }),
        });
        const res = await PUT(req);
        expect(res.status).toBe(200);
    });

    it('returns 400 on validation error (editorMaxBytes too small)', async () => {
        const req = new NextRequest('http://localhost/api/modules/file-browser/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ editorMaxBytes: 100 }), // below min 32768
        });
        const res = await PUT(req);
        expect(res.status).toBe(400);
    });
});
