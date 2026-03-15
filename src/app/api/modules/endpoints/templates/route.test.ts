/** @vitest-environment node */
import { describe, it, expect } from 'vitest';

import { GET } from './route';

describe('GET /api/modules/endpoints/templates', () => {
    it('returns templates array', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(Array.isArray(json.templates)).toBe(true);
        expect(json.templates.length).toBeGreaterThan(0);
    });

    it('each template has required fields', async () => {
        const res = await GET();
        const json = await res.json();
        for (const t of json.templates) {
            expect(typeof t.id).toBe('string');
            expect(typeof t.name).toBe('string');
            expect(typeof t.description).toBe('string');
            expect(typeof t.method).toBe('string');
            expect(typeof t.endpointType).toBe('string');
        }
    });

    it('includes health-check template', async () => {
        const res = await GET();
        const json = await res.json();
        const healthCheck = json.templates.find((t: { id: string }) => t.id === 'health-check');
        expect(healthCheck).toBeDefined();
        expect(healthCheck.method).toBe('GET');
        expect(healthCheck.endpointType).toBe('script');
    });

    it('includes webhook templates', async () => {
        const res = await GET();
        const json = await res.json();
        const webhookTemplates = json.templates.filter((t: { endpointType: string }) => t.endpointType === 'webhook');
        expect(webhookTemplates.length).toBeGreaterThan(0);
    });

    it('template tags are arrays', async () => {
        const res = await GET();
        const json = await res.json();
        for (const t of json.templates) {
            expect(Array.isArray(t.tags)).toBe(true);
        }
    });
});
