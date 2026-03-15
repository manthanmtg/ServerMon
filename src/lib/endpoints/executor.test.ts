/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./script-executor', () => ({
  executeScript: vi.fn(),
}));
vi.mock('./webhook-executor', () => ({
  executeWebhook: vi.fn(),
}));
vi.mock('./logic-executor', () => ({
  executeLogic: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { executeEndpoint, type ExecutionInput } from './executor';
import { executeScript } from './script-executor';
import { executeWebhook } from './webhook-executor';
import { executeLogic } from './logic-executor';
import type { ICustomEndpoint } from '@/models/CustomEndpoint';

function makeEndpoint(overrides: Partial<ICustomEndpoint> = {}): ICustomEndpoint {
  return {
    slug: 'test-endpoint',
    endpointType: 'script',
    ...overrides,
  } as unknown as ICustomEndpoint;
}

function makeInput(overrides: Partial<ExecutionInput> = {}): ExecutionInput {
  return {
    method: 'GET',
    headers: {},
    query: {},
    ...overrides,
  };
}

const successResult = {
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: '{"ok":true}',
  duration: 0,
};

describe('executeEndpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches to executeScript for type=script', async () => {
    vi.mocked(executeScript).mockResolvedValue(successResult);
    const endpoint = makeEndpoint({ endpointType: 'script' });
    const result = await executeEndpoint(endpoint, makeInput());

    expect(executeScript).toHaveBeenCalledWith(endpoint, expect.any(Object));
    expect(result.statusCode).toBe(200);
  });

  it('dispatches to executeWebhook for type=webhook', async () => {
    vi.mocked(executeWebhook).mockResolvedValue(successResult);
    const endpoint = makeEndpoint({ endpointType: 'webhook' });
    const result = await executeEndpoint(endpoint, makeInput());

    expect(executeWebhook).toHaveBeenCalledWith(endpoint, expect.any(Object));
    expect(result.statusCode).toBe(200);
  });

  it('dispatches to executeLogic for type=logic', async () => {
    vi.mocked(executeLogic).mockResolvedValue(successResult);
    const endpoint = makeEndpoint({ endpointType: 'logic' });
    const result = await executeEndpoint(endpoint, makeInput());

    expect(executeLogic).toHaveBeenCalledWith(endpoint, expect.any(Object));
    expect(result.statusCode).toBe(200);
  });

  it('returns 500 for an unknown endpoint type', async () => {
    const endpoint = makeEndpoint({ endpointType: 'unknown' as 'script' });
    const result = await executeEndpoint(endpoint, makeInput());

    expect(result.statusCode).toBe(500);
    expect(result.body).toContain('Unknown endpoint type');
  });

  it('returns 500 and error field when executor throws', async () => {
    vi.mocked(executeScript).mockRejectedValue(new Error('spawn failed'));
    const endpoint = makeEndpoint({ endpointType: 'script', slug: 'bad-endpoint' });
    const result = await executeEndpoint(endpoint, makeInput());

    expect(result.statusCode).toBe(500);
    expect(result.error).toBe('spawn failed');
    expect(result.body).toContain('spawn failed');
  });

  it('handles non-Error thrown values gracefully', async () => {
    vi.mocked(executeScript).mockRejectedValue('string error');
    const endpoint = makeEndpoint({ endpointType: 'script' });
    const result = await executeEndpoint(endpoint, makeInput());

    expect(result.statusCode).toBe(500);
    expect(result.error).toBe('Unknown execution error');
  });

  it('sets a numeric duration on the returned result', async () => {
    vi.mocked(executeScript).mockResolvedValue({ ...successResult, duration: 0 });
    const endpoint = makeEndpoint({ endpointType: 'script' });
    const result = await executeEndpoint(endpoint, makeInput());

    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
