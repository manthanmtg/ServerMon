/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockWriteUpload } = vi.hoisted(() => ({
    mockWriteUpload: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/modules/file-browser/lib/file-browser', () => ({
    writeUpload: mockWriteUpload,
    FileBrowserError: class FileBrowserError extends Error {
        status: number;
        constructor(message: string, status = 500) {
            super(message);
            this.status = status;
        }
    },
}));

import { POST } from './route';

function makeFormDataRequest(path: string, files: File[]) {
    const formData = new FormData();
    formData.set('path', path);
    for (const file of files) {
        formData.append('files', file);
    }
    return new NextRequest('http://localhost/api/modules/file-browser/upload', {
        method: 'POST',
        body: formData,
    });
}

describe('POST /api/modules/file-browser/upload', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('uploads a single file successfully', async () => {
        mockWriteUpload.mockResolvedValue('/uploads/test.txt');
        const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
        const req = makeFormDataRequest('/uploads', [file]);
        const res = await POST(req);
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.uploadedPaths).toHaveLength(1);
        expect(json.uploadedPaths[0]).toBe('/uploads/test.txt');
    });

    it('uploads multiple files', async () => {
        mockWriteUpload
            .mockResolvedValueOnce('/uploads/a.txt')
            .mockResolvedValueOnce('/uploads/b.txt');
        const fileA = new File(['aaa'], 'a.txt', { type: 'text/plain' });
        const fileB = new File(['bbb'], 'b.txt', { type: 'text/plain' });
        const req = makeFormDataRequest('/uploads', [fileA, fileB]);
        const res = await POST(req);
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.uploadedPaths).toHaveLength(2);
    });

    it('returns 400 when path is missing', async () => {
        const formData = new FormData();
        const file = new File(['hello'], 'test.txt');
        formData.append('files', file);
        const req = new NextRequest('http://localhost/api/modules/file-browser/upload', {
            method: 'POST',
            body: formData,
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('Target path is required');
    });

    it('returns 400 when no files provided', async () => {
        const formData = new FormData();
        formData.set('path', '/uploads');
        const req = new NextRequest('http://localhost/api/modules/file-browser/upload', {
            method: 'POST',
            body: formData,
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('At least one file is required');
    });

    it('returns 500 on write error', async () => {
        mockWriteUpload.mockRejectedValue(new Error('disk full'));
        const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
        const req = makeFormDataRequest('/uploads', [file]);
        const res = await POST(req);
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('disk full');
    });
});
