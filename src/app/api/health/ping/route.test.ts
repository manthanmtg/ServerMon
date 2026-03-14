/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn().mockImplementation((body: unknown) => ({
            status: 200,
            json: async () => body,
        })),
    },
}));

import { GET } from './route';

describe('GET /api/health/ping', () => {
    it('returns pong: true', async () => {
        const response = await GET();
        const body = await response.json();

        expect(body.pong).toBe(true);
    });

    it('includes a timestamp string in ISO format', async () => {
        const response = await GET();
        const body = await response.json();

        expect(typeof body.timestamp).toBe('string');
        // Should parse as a valid date
        expect(isNaN(Date.parse(body.timestamp))).toBe(false);
    });

    it('always returns HTTP 200', async () => {
        const response = await GET();
        expect(response.status).toBe(200);
    });
});
