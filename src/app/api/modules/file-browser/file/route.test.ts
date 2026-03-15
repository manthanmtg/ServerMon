/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
    mockPreviewFile,
    mockReadEditableFile,
    mockCreateDownloadStream,
    mockSaveFile,
    mockResolveBrowserPath,
    mockFindById,
} = vi.hoisted(() => ({
    mockPreviewFile: vi.fn(),
    mockReadEditableFile: vi.fn(),
    mockCreateDownloadStream: vi.fn(),
    mockSaveFile: vi.fn(),
    mockResolveBrowserPath: vi.fn((p: string) => p),
    mockFindById: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/models/FileBrowserSettings', () => ({
    default: { findById: mockFindById },
}));
vi.mock('@/modules/file-browser/lib/file-browser', () => ({
    previewFile: mockPreviewFile,
    readEditableFile: mockReadEditableFile,
    createDownloadStream: mockCreateDownloadStream,
    saveFile: mockSaveFile,
    resolveBrowserPath: mockResolveBrowserPath,
    FileBrowserError: class FileBrowserError extends Error {
        status: number;
        constructor(message: string, status = 500) {
            super(message);
            this.status = status;
        }
    },
}));

import { GET, PUT } from './route';

describe('GET /api/modules/file-browser/file (preview)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveBrowserPath.mockImplementation((p: string) => p);
        mockFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    });

    it('returns preview for a file', async () => {
        const file = { content: 'Hello World', mimeType: 'text/plain', size: 11 };
        mockPreviewFile.mockResolvedValue(file);
        const req = new NextRequest('http://localhost/api/modules/file-browser/file?path=/home/user/test.txt');
        const res = await GET(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.file.content).toBe('Hello World');
    });

    it('returns editable file content when action=edit', async () => {
        const file = { content: 'editable content', mimeType: 'text/plain', size: 16 };
        mockReadEditableFile.mockResolvedValue(file);
        const req = new NextRequest('http://localhost/api/modules/file-browser/file?path=/home/user/test.txt&action=edit');
        const res = await GET(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.file.content).toBe('editable content');
        expect(mockReadEditableFile).toHaveBeenCalled();
    });

    it('returns download stream when action=download', async () => {
        const readableStream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('file content'));
                controller.close();
            }
        });
        mockCreateDownloadStream.mockResolvedValue({
            stream: readableStream,
            fileName: 'test.txt',
            mimeType: 'text/plain',
        });
        const req = new NextRequest('http://localhost/api/modules/file-browser/file?path=/home/user/test.txt&action=download');
        const res = await GET(req);
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Disposition')).toContain('test.txt');
    });

    it('returns 500 on error', async () => {
        mockPreviewFile.mockRejectedValue(new Error('ENOENT'));
        const req = new NextRequest('http://localhost/api/modules/file-browser/file?path=/nonexistent');
        const res = await GET(req);
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBeDefined();
    });

    it('uses custom limits from settings', async () => {
        mockFindById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({ previewMaxBytes: 65536, editorMaxBytes: 131072 }),
        });
        const file = { content: 'data', mimeType: 'text/plain', size: 4 };
        mockPreviewFile.mockResolvedValue(file);
        const req = new NextRequest('http://localhost/api/modules/file-browser/file?path=/home/user/file.txt');
        const res = await GET(req);
        expect(res.status).toBe(200);
        expect(mockPreviewFile).toHaveBeenCalledWith('/home/user/file.txt', 65536);
    });
});

describe('PUT /api/modules/file-browser/file', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveBrowserPath.mockImplementation((p: string) => p);
    });

    it('saves file content successfully', async () => {
        mockSaveFile.mockResolvedValue(undefined);
        const req = new NextRequest('http://localhost/api/modules/file-browser/file', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/home/user/test.txt', content: 'new content' }),
        });
        const res = await PUT(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
    });

    it('returns 500 on validation error (empty path)', async () => {
        const req = new NextRequest('http://localhost/api/modules/file-browser/file', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '', content: 'data' }),
        });
        const res = await PUT(req);
        expect(res.status).toBe(500);
    });

    it('returns 500 on save error', async () => {
        mockSaveFile.mockRejectedValue(new Error('EACCES'));
        const req = new NextRequest('http://localhost/api/modules/file-browser/file', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/root/protected.txt', content: 'data' }),
        });
        const res = await PUT(req);
        expect(res.status).toBe(500);
    });
});
