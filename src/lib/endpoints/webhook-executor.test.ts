/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { executeWebhook } from './webhook-executor';
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
    slug: 'webhook-ep',
    method: 'POST',
    endpointType: 'webhook',
    timeout: 5000,
    ...overrides,
  } as unknown as ICustomEndpoint;
}

function makeInput(overrides: Partial<ExecutionInput> = {}): ExecutionInput {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    query: {},
    body: '{"key":"value"}',
    ...overrides,
  };
}

describe('executeWebhook', () => {
  // ── missing config ─────────────────────────────────────────────────────────

  it('returns 500 when webhookConfig is absent', async () => {
    const endpoint = makeEndpoint({ webhookConfig: undefined });
    const result = await executeWebhook(endpoint, makeInput());
    expect(result.statusCode).toBe(500);
    expect(result.error).toContain('Webhook target URL is not configured');
  });

  it('returns 500 when targetUrl is empty', async () => {
    const endpoint = makeEndpoint({
      webhookConfig: { targetUrl: '' } as ICustomEndpoint['webhookConfig'],
    });
    const result = await executeWebhook(endpoint, makeInput());
    expect(result.statusCode).toBe(500);
    expect(result.error).toContain('Webhook target URL is not configured');
  });

  // ── successful request ─────────────────────────────────────────────────────

  it('calls fetch and returns the upstream status code and body', async () => {
    const mockResponseHeaders = new Headers({ 'content-type': 'application/json' });
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: mockResponseHeaders,
      text: vi.fn().mockResolvedValue('{"result":"ok"}'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      webhookConfig: { targetUrl: 'https://example.com/hook' },
    });
    const result = await executeWebhook(endpoint, makeInput());

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('{"result":"ok"}');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('uses config.method when provided, overriding endpoint.method', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('ok'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      method: 'POST',
      webhookConfig: { targetUrl: 'https://example.com/hook', method: 'PUT' },
    });
    const result = await executeWebhook(endpoint, makeInput());

    expect(result.statusCode).toBe(200);
    const call = mockFetch.mock.calls[0][1] as RequestInit;
    expect(call.method).toBe('PUT');
  });

  it('preserves non-sensitive headers when forwardHeaders=true', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('ok'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      webhookConfig: {
        targetUrl: 'https://example.com/hook',
        forwardHeaders: true,
      },
    });
    const input = makeInput({
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'abc123',
        host: 'should-be-excluded',
        authorization: 'Bearer secret',
        cookie: 'session=xyz',
      },
    });
    await executeWebhook(endpoint, input);

    const sentHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(sentHeaders['x-request-id']).toBe('abc123');
    expect(sentHeaders['host']).toBeUndefined();
    expect(sentHeaders['authorization']).toBeUndefined();
    expect(sentHeaders['cookie']).toBeUndefined();
  });

  it('does not forward headers when forwardHeaders is false/absent', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('ok'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      webhookConfig: { targetUrl: 'https://example.com/hook', forwardHeaders: false },
    });
    const input = makeInput({ headers: { 'content-type': 'application/json', 'x-custom': 'val' } });
    await executeWebhook(endpoint, input);

    const sentHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(sentHeaders['x-custom']).toBeUndefined();
  });

  // ── GET requests have no body ──────────────────────────────────────────────

  it('does not include body for GET requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('ok'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      method: 'GET',
      webhookConfig: { targetUrl: 'https://example.com/hook', method: 'GET' },
    });
    const result = await executeWebhook(endpoint, makeInput({ method: 'GET' }));

    expect(result.statusCode).toBe(200);
    const call = mockFetch.mock.calls[0][1] as RequestInit;
    expect(call.body).toBeUndefined();
  });

  // ── transformBody ──────────────────────────────────────────────────────────

  it('applies transformBody function to the outgoing body', async () => {
    let capturedBody: string | undefined;
    const mockFetch = vi.fn().mockImplementation(async (_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return {
        status: 200,
        headers: new Headers(),
        text: vi.fn().mockResolvedValue('ok'),
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      webhookConfig: {
        targetUrl: 'https://example.com/hook',
        transformBody: 'return { transformed: input.key };',
      },
    });
    await executeWebhook(endpoint, makeInput({ body: '{"key":"val"}' }));

    expect(capturedBody).toBe('{"transformed":"val"}');
  });

  it('falls back to original body when transformBody throws', async () => {
    let capturedBody: string | undefined;
    const mockFetch = vi.fn().mockImplementation(async (_url: unknown, init: RequestInit) => {
      capturedBody = init.body as string;
      return {
        status: 200,
        headers: new Headers(),
        text: vi.fn().mockResolvedValue('ok'),
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      webhookConfig: {
        targetUrl: 'https://example.com/hook',
        transformBody: 'throw new Error("transform error");',
      },
    });
    const input = makeInput({ body: '{"original":true}' });
    await executeWebhook(endpoint, input);

    expect(capturedBody).toBe('{"original":true}');
  });

  // ── timeout ────────────────────────────────────────────────────────────────

  it('returns 504 on AbortError (timeout)', async () => {
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    const mockFetch = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      timeout: 100,
      webhookConfig: { targetUrl: 'https://example.com/hook' },
    });
    const result = await executeWebhook(endpoint, makeInput());

    expect(result.statusCode).toBe(504);
    expect(result.body).toContain('timed out');
  });

  // ── network errors ─────────────────────────────────────────────────────────

  it('returns 502 on generic network failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      webhookConfig: { targetUrl: 'https://example.com/hook' },
    });
    const result = await executeWebhook(endpoint, makeInput());

    expect(result.statusCode).toBe(502);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('returns 502 on non-Error throw', async () => {
    const mockFetch = vi.fn().mockRejectedValue('string error');
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      webhookConfig: { targetUrl: 'https://example.com/hook' },
    });
    const result = await executeWebhook(endpoint, makeInput());

    expect(result.statusCode).toBe(502);
  });

  // ── response body truncation ───────────────────────────────────────────────

  it('truncates response body to 10240 characters', async () => {
    const longBody = 'x'.repeat(20000);
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue(longBody),
    });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = makeEndpoint({
      webhookConfig: { targetUrl: 'https://example.com/hook' },
    });
    const result = await executeWebhook(endpoint, makeInput());

    expect(result.body.length).toBeLessThanOrEqual(10240);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
