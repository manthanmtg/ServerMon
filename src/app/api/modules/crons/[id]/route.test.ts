/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUpdateJob, mockDeleteJob } = vi.hoisted(() => ({
    mockUpdateJob: vi.fn(),
    mockDeleteJob: vi.fn(),
}));

vi.mock('@/lib/crons/service', () => ({
    cronsService: { updateJob: mockUpdateJob, deleteJob: mockDeleteJob },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { PUT, DELETE } from './route';
import { NextRequest } from 'next/server';

function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
}

function makePutRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('PUT /api/modules/crons/[id]', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('updates a cron job successfully', async () => {
        mockUpdateJob.mockResolvedValue({ success: true });
        const res = await PUT(makePutRequest({ minute: '0' }), makeContext('job-1'));
        expect(res.status).toBe(200);
        expect(mockUpdateJob).toHaveBeenCalledWith('job-1', { minute: '0' });
    });

    it('returns 400 when update fails', async () => {
        mockUpdateJob.mockResolvedValue({ success: false, message: 'Job not found' });
        const res = await PUT(makePutRequest({ minute: '0' }), makeContext('job-1'));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('Job not found');
    });

    it('returns 500 on service throw', async () => {
        mockUpdateJob.mockRejectedValue(new Error('db error'));
        const res = await PUT(makePutRequest({}), makeContext('job-1'));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to update cron job');
    });
});

describe('DELETE /api/modules/crons/[id]', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('deletes a cron job successfully', async () => {
        mockDeleteJob.mockResolvedValue({ success: true });
        const res = await DELETE(new NextRequest('http://localhost'), makeContext('job-1'));
        expect(res.status).toBe(200);
        expect(mockDeleteJob).toHaveBeenCalledWith('job-1');
    });

    it('returns 400 when job not found', async () => {
        mockDeleteJob.mockResolvedValue({ success: false, message: 'Job not found' });
        const res = await DELETE(new NextRequest('http://localhost'), makeContext('job-1'));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('Job not found');
    });

    it('returns 500 on service throw', async () => {
        mockDeleteJob.mockRejectedValue(new Error('write error'));
        const res = await DELETE(new NextRequest('http://localhost'), makeContext('job-1'));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to delete cron job');
    });
});
