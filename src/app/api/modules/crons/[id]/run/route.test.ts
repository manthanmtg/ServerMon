/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSnapshot, mockRunJobNow, mockGetRunStatus, mockListRuns } = vi.hoisted(() => ({
    mockGetSnapshot: vi.fn(),
    mockRunJobNow: vi.fn(),
    mockGetRunStatus: vi.fn(),
    mockListRuns: vi.fn(),
}));

vi.mock('@/lib/crons/service', () => ({
    cronsService: {
        getSnapshot: mockGetSnapshot,
        runJobNow: mockRunJobNow,
        getRunStatus: mockGetRunStatus,
        listRuns: mockListRuns,
    },
}));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { POST, GET } from './route';
import { NextRequest } from 'next/server';

function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
}

function makeGetRequest(params?: Record<string, string>): NextRequest {
    const url = new URL('http://localhost/api/modules/crons/job-1/run');
    if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    return new NextRequest(url.toString());
}

describe('POST /api/modules/crons/[id]/run', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('runs a user cron job successfully', async () => {
        mockGetSnapshot.mockResolvedValue({
            jobs: [{ id: 'job-1', command: 'echo hi', source: 'user' }],
        });
        mockRunJobNow.mockReturnValue({ runId: 'run-1', status: 'running' });
        const res = await POST(new NextRequest('http://localhost'), makeContext('job-1'));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
    });

    it('returns 404 when job not found', async () => {
        mockGetSnapshot.mockResolvedValue({ jobs: [] });
        const res = await POST(new NextRequest('http://localhost'), makeContext('missing'));
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json.error).toBe('Cron job not found');
    });

    it('returns 403 when job is not a user job', async () => {
        mockGetSnapshot.mockResolvedValue({
            jobs: [{ id: 'job-1', command: 'apt update', source: 'system' }],
        });
        const res = await POST(new NextRequest('http://localhost'), makeContext('job-1'));
        expect(res.status).toBe(403);
        const json = await res.json();
        expect(json.error).toBe('Only user cron jobs can be run manually');
    });

    it('returns 500 on service throw', async () => {
        mockGetSnapshot.mockRejectedValue(new Error('error'));
        const res = await POST(new NextRequest('http://localhost'), makeContext('job-1'));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to trigger manual run');
    });
});

describe('GET /api/modules/crons/[id]/run', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns specific run status when runId is provided', async () => {
        const run = { runId: 'run-1', status: 'completed' };
        mockGetRunStatus.mockResolvedValue(run);
        const res = await GET(makeGetRequest({ runId: 'run-1' }), makeContext('job-1'));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.runId).toBe('run-1');
    });

    it('returns 404 when run not found', async () => {
        mockGetRunStatus.mockResolvedValue(null);
        const res = await GET(makeGetRequest({ runId: 'missing' }), makeContext('job-1'));
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json.error).toBe('Run not found');
    });

    it('lists runs for a job when no runId', async () => {
        const runs = [{ runId: 'run-1', status: 'completed' }];
        mockListRuns.mockResolvedValue(runs);
        const res = await GET(makeGetRequest(), makeContext('job-1'));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toEqual(runs);
        expect(mockListRuns).toHaveBeenCalledWith('job-1');
    });

    it('returns 500 on error', async () => {
        mockListRuns.mockRejectedValue(new Error('db error'));
        const res = await GET(makeGetRequest(), makeContext('job-1'));
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Failed to get run status');
    });
});
