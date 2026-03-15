/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { executeLogic } from './logic-executor';
import type { ICustomEndpoint } from '@/models/CustomEndpoint';
import type { ExecutionInput } from './executor';

vi.mock('@/lib/logger', () => ({
    createLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

function makeEndpoint(overrides: Partial<ICustomEndpoint> = {}): ICustomEndpoint {
    return {
        slug: 'logic-ep',
        endpointType: 'logic',
        ...overrides,
    } as unknown as ICustomEndpoint;
}

function makeInput(overrides: Partial<ExecutionInput> = {}): ExecutionInput {
    return {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        query: {},
        ...overrides,
    };
}

describe('executeLogic', () => {
    // ── no config ──────────────────────────────────────────────────────────────

    it('returns 500 when logicConfig is missing', async () => {
        const result = await executeLogic(makeEndpoint(), makeInput());
        expect(result.statusCode).toBe(500);
        expect(result.error).toContain('Logic configuration is missing');
    });

    // ── body parsing ───────────────────────────────────────────────────────────

    it('parses JSON body and returns default 200 response', async () => {
        const endpoint = makeEndpoint({ logicConfig: {} });
        const result = await executeLogic(endpoint, makeInput({ body: '{"name":"Alice"}' }));
        expect(result.statusCode).toBe(200);
        const parsed = JSON.parse(result.body);
        expect(parsed.input).toEqual({ name: 'Alice' });
    });

    it('accepts non-JSON body as raw string', async () => {
        const endpoint = makeEndpoint({ logicConfig: {} });
        const result = await executeLogic(endpoint, makeInput({ body: 'raw text body' }));
        expect(result.statusCode).toBe(200);
        const parsed = JSON.parse(result.body);
        expect(parsed.input).toBe('raw text body');
    });

    it('handles missing body and returns empty input', async () => {
        const endpoint = makeEndpoint({ logicConfig: {} });
        const result = await executeLogic(endpoint, makeInput({ body: undefined }));
        expect(result.statusCode).toBe(200);
        const parsed = JSON.parse(result.body);
        expect(parsed.input).toEqual({});
    });

    // ── requestSchema validation ───────────────────────────────────────────────

    it('validates required object fields and returns 400 on failure', async () => {
        const requestSchema = JSON.stringify({
            type: 'object',
            required: ['name', 'age'],
        });
        const endpoint = makeEndpoint({ logicConfig: { requestSchema } });
        const result = await executeLogic(
            endpoint,
            makeInput({ body: '{"name":"Bob"}' })
        );
        expect(result.statusCode).toBe(400);
        const parsed = JSON.parse(result.body);
        expect(parsed.error).toBe('Validation failed');
        expect(parsed.details).toContain('Missing required field: age');
    });

    it('passes validation when all required fields are present', async () => {
        const requestSchema = JSON.stringify({
            type: 'object',
            required: ['name'],
        });
        const endpoint = makeEndpoint({ logicConfig: { requestSchema } });
        const result = await executeLogic(
            endpoint,
            makeInput({ body: '{"name":"Alice"}' })
        );
        expect(result.statusCode).toBe(200);
    });

    it('returns 400 when object schema receives non-object data', async () => {
        const requestSchema = JSON.stringify({ type: 'object', required: ['x'] });
        const endpoint = makeEndpoint({ logicConfig: { requestSchema } });
        const result = await executeLogic(
            endpoint,
            makeInput({ body: '"just a string"' })
        );
        expect(result.statusCode).toBe(400);
        const parsed = JSON.parse(result.body);
        expect(parsed.details).toContain('Expected an object');
    });

    it('validates string type and returns 400 on mismatch', async () => {
        const requestSchema = JSON.stringify({ type: 'string' });
        const endpoint = makeEndpoint({ logicConfig: { requestSchema } });
        const result = await executeLogic(
            endpoint,
            makeInput({ body: '42' })
        );
        expect(result.statusCode).toBe(400);
        const parsed = JSON.parse(result.body);
        expect(parsed.details[0]).toContain('Expected string');
    });

    it('validates number type and returns 400 on mismatch', async () => {
        const requestSchema = JSON.stringify({ type: 'number' });
        const endpoint = makeEndpoint({ logicConfig: { requestSchema } });
        const result = await executeLogic(
            endpoint,
            makeInput({ body: '"not a number"' })
        );
        expect(result.statusCode).toBe(400);
        const parsed = JSON.parse(result.body);
        expect(parsed.details[0]).toContain('Expected number');
    });

    it('ignores invalid JSON in requestSchema (proceeds without validation)', async () => {
        const endpoint = makeEndpoint({ logicConfig: { requestSchema: 'not-valid-json' } });
        const result = await executeLogic(endpoint, makeInput({ body: '{"x":1}' }));
        // Should not crash — schema parse error is caught and proceeds
        expect(result.statusCode).toBe(200);
    });

    // ── handlerCode ────────────────────────────────────────────────────────────

    it('executes handlerCode and returns its result', async () => {
        const handlerCode = 'return { statusCode: 201, body: JSON.stringify({ created: true }) };';
        const endpoint = makeEndpoint({ logicConfig: { handlerCode } });
        const result = await executeLogic(endpoint, makeInput());

        expect(result.statusCode).toBe(201);
        const parsed = JSON.parse(result.body);
        expect(parsed.created).toBe(true);
    });

    it('executes handlerCode with access to input, query, headers, method', async () => {
        const handlerCode = `
            return {
                statusCode: 200,
                body: JSON.stringify({ method, hasInput: typeof input === 'object' })
            };
        `;
        const endpoint = makeEndpoint({ logicConfig: { handlerCode } });
        const result = await executeLogic(
            endpoint,
            makeInput({ method: 'POST', body: '{"key":"val"}' })
        );

        expect(result.statusCode).toBe(200);
        const parsed = JSON.parse(result.body);
        expect(parsed.method).toBe('POST');
        expect(parsed.hasInput).toBe(true);
    });

    it('handles handlerCode that returns a Promise', async () => {
        const handlerCode = 'return Promise.resolve({ statusCode: 202, body: "accepted" });';
        const endpoint = makeEndpoint({ logicConfig: { handlerCode } });
        const result = await executeLogic(endpoint, makeInput());

        expect(result.statusCode).toBe(202);
        expect(result.body).toBe('accepted');
    });

    it('returns primitive result from handlerCode wrapped as JSON', async () => {
        const handlerCode = 'return 42;';
        const endpoint = makeEndpoint({ logicConfig: { handlerCode } });
        const result = await executeLogic(endpoint, makeInput());

        expect(result.statusCode).toBe(200);
        expect(result.body).toBe('42');
    });

    it('uses custom statusCode from handlerCode result', async () => {
        const handlerCode = 'return { statusCode: 404, body: "not found" };';
        const endpoint = makeEndpoint({ logicConfig: { handlerCode } });
        const result = await executeLogic(endpoint, makeInput());
        expect(result.statusCode).toBe(404);
    });

    it('uses custom headers from handlerCode result', async () => {
        const handlerCode = 'return { statusCode: 200, headers: { "x-custom": "yes" }, body: "ok" };';
        const endpoint = makeEndpoint({ logicConfig: { handlerCode } });
        const result = await executeLogic(endpoint, makeInput());
        expect(result.headers['x-custom']).toBe('yes');
    });

    it('returns 500 when handlerCode throws', async () => {
        const handlerCode = 'throw new Error("handler blew up");';
        const endpoint = makeEndpoint({ logicConfig: { handlerCode } });
        const result = await executeLogic(endpoint, makeInput());

        expect(result.statusCode).toBe(500);
        expect(result.error).toBe('handler blew up');
    });

    it('stringifies object body in handlerCode result', async () => {
        const handlerCode = 'return { statusCode: 200, body: { items: [1,2,3] } };';
        const endpoint = makeEndpoint({ logicConfig: { handlerCode } });
        const result = await executeLogic(endpoint, makeInput());
        const parsed = JSON.parse(result.body);
        expect(parsed.items).toEqual([1, 2, 3]);
    });

    it('truncates body from handlerCode at 10240 chars', async () => {
        const handlerCode = `return { statusCode: 200, body: 'x'.repeat(20000) };`;
        const endpoint = makeEndpoint({ logicConfig: { handlerCode } });
        const result = await executeLogic(endpoint, makeInput());
        expect(result.body.length).toBeLessThanOrEqual(10240);
    });

    // ── responseMapping ────────────────────────────────────────────────────────

    it('uses responseMapping JSON to produce a structured response', async () => {
        const responseMapping = JSON.stringify({
            statusCode: 200,
            headers: { 'x-src': 'mapping' },
            body: { result: 'fixed' },
        });
        const endpoint = makeEndpoint({ logicConfig: { responseMapping } });
        const result = await executeLogic(endpoint, makeInput());

        expect(result.statusCode).toBe(200);
        expect(result.headers['x-src']).toBe('mapping');
        const parsed = JSON.parse(result.body);
        expect(parsed.result).toBe('fixed');
    });

    it('falls back to raw string when responseMapping is not JSON', async () => {
        const endpoint = makeEndpoint({ logicConfig: { responseMapping: 'plain text response' } });
        const result = await executeLogic(endpoint, makeInput());

        expect(result.statusCode).toBe(200);
        expect(result.body).toBe('plain text response');
    });

    it('responseMapping defaults statusCode to 200 when missing', async () => {
        const responseMapping = JSON.stringify({ body: { msg: 'ok' } });
        const endpoint = makeEndpoint({ logicConfig: { responseMapping } });
        const result = await executeLogic(endpoint, makeInput());
        expect(result.statusCode).toBe(200);
    });

    // ── no handlerCode / no responseMapping ────────────────────────────────────

    it('returns default 200 OK when config has no handlerCode or responseMapping', async () => {
        const endpoint = makeEndpoint({ logicConfig: {} });
        const result = await executeLogic(endpoint, makeInput({ body: '{"x":1}' }));

        expect(result.statusCode).toBe(200);
        const parsed = JSON.parse(result.body);
        expect(parsed.message).toBe('OK');
    });
});
