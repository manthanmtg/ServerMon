import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  handleRequestWithDiagnostics,
  shouldInstrumentRequest,
} from './server-request-diagnostics';

class FakeResponse extends EventEmitter {
  statusCode = 200;
  writableEnded = false;
  headersSent = false;

  end = vi.fn((body?: string) => {
    this.writableEnded = true;
    this.headersSent = true;
    this.emit('finish');
    return body;
  });
}

describe('server request diagnostics', () => {
  it('does not instrument ignored long-lived routes', async () => {
    const diagnostics = {
      beginRequest: vi.fn(),
      completeRequest: vi.fn(),
      getSlowRequestThresholdMs: vi.fn(() => 2000),
    };
    const log = { warn: vi.fn(), error: vi.fn() };
    const handle = vi.fn(async () => {});

    await handleRequestWithDiagnostics({
      req: { method: 'GET', url: '/api/metrics/stream' } as never,
      res: new FakeResponse() as never,
      parsedUrl: { pathname: '/api/metrics/stream' } as never,
      handle,
      diagnostics,
      log,
    });

    expect(handle).toHaveBeenCalledOnce();
    expect(diagnostics.beginRequest).not.toHaveBeenCalled();
    expect(diagnostics.completeRequest).not.toHaveBeenCalled();
  });

  it('tracks normal requests and records completion', async () => {
    const diagnostics = {
      beginRequest: vi.fn(() => 'req-1'),
      completeRequest: vi.fn(() => ({ durationMs: 120 })),
      getSlowRequestThresholdMs: vi.fn(() => 2000),
    };
    const log = { warn: vi.fn(), error: vi.fn() };
    const response = new FakeResponse();
    const handle = vi.fn(async (_req, res: FakeResponse) => {
      res.statusCode = 204;
      res.writableEnded = true;
      res.headersSent = true;
      res.emit('finish');
    });

    await handleRequestWithDiagnostics({
      req: { method: 'GET', url: '/api/system/diagnostics' } as never,
      res: response as never,
      parsedUrl: { pathname: '/api/system/diagnostics' } as never,
      handle: handle as never,
      diagnostics,
      log,
    });

    expect(diagnostics.beginRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/system/diagnostics',
    });
    expect(diagnostics.completeRequest).toHaveBeenCalledWith('req-1', {
      statusCode: 204,
      outcome: 'completed',
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('records errors and returns a 500 when the handler throws', async () => {
    const diagnostics = {
      beginRequest: vi.fn(() => 'req-2'),
      completeRequest: vi.fn(() => ({ durationMs: 10 })),
      getSlowRequestThresholdMs: vi.fn(() => 2000),
    };
    const log = { warn: vi.fn(), error: vi.fn() };
    const response = new FakeResponse();
    const handle = vi.fn(async () => {
      throw new Error('boom');
    });

    await handleRequestWithDiagnostics({
      req: { method: 'GET', url: '/api/test' } as never,
      res: response as never,
      parsedUrl: { pathname: '/api/test' } as never,
      handle,
      diagnostics,
      log,
    });

    expect(response.statusCode).toBe(500);
    expect(response.end).toHaveBeenCalledWith('Internal Server Error');
    expect(diagnostics.completeRequest).toHaveBeenCalledWith('req-2', {
      statusCode: 500,
      outcome: 'error',
    });
    expect(log.error).toHaveBeenCalled();
  });

  it('exposes the ignored-route rule directly', () => {
    expect(shouldInstrumentRequest('/api/metrics/stream')).toBe(false);
    expect(shouldInstrumentRequest('/api/socket')).toBe(false);
    expect(shouldInstrumentRequest('/api/system/diagnostics')).toBe(true);
  });
});
