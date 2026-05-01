/** @vitest-environment node */
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

  it('records an aborted request when the response closes before ending', async () => {
    const diagnostics = {
      beginRequest: vi.fn(() => 'req-3'),
      completeRequest: vi.fn(() => ({ durationMs: 10 })),
      getSlowRequestThresholdMs: vi.fn(() => 2000),
    };
    const log = { warn: vi.fn(), error: vi.fn() };
    const response = new FakeResponse();
    const handle = vi.fn(async (_req, res: FakeResponse) => {
      res.emit('close');
    });

    await handleRequestWithDiagnostics({
      req: { method: 'POST', url: '/api/test' } as never,
      res: response as never,
      parsedUrl: { pathname: '/api/test' } as never,
      handle: handle as never,
      diagnostics,
      log,
    });

    expect(diagnostics.completeRequest).toHaveBeenCalledWith('req-3', {
      statusCode: 200,
      outcome: 'aborted',
    });
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs slow requests when completed duration reaches the threshold', async () => {
    const record = { durationMs: 2500 };
    const diagnostics = {
      beginRequest: vi.fn(() => 'req-4'),
      completeRequest: vi.fn(() => record),
      getSlowRequestThresholdMs: vi.fn(() => 2000),
    };
    const log = { warn: vi.fn(), error: vi.fn() };
    const response = new FakeResponse();
    const handle = vi.fn(async (_req, res: FakeResponse) => {
      res.emit('finish');
    });

    await handleRequestWithDiagnostics({
      req: { method: 'GET', url: '/api/slow' } as never,
      res: response as never,
      parsedUrl: { pathname: '/api/slow' } as never,
      handle: handle as never,
      diagnostics,
      log,
    });

    expect(log.warn).toHaveBeenCalledWith('Slow request detected', record);
  });

  it('falls back to req.url when parsedUrl has no pathname', async () => {
    const diagnostics = {
      beginRequest: vi.fn(() => 'req-5'),
      completeRequest: vi.fn(() => ({ durationMs: 10 })),
      getSlowRequestThresholdMs: vi.fn(() => 2000),
    };
    const log = { warn: vi.fn(), error: vi.fn() };
    const response = new FakeResponse();
    const handle = vi.fn(async (_req, res: FakeResponse) => {
      res.emit('finish');
    });

    await handleRequestWithDiagnostics({
      req: { method: 'PATCH', url: '/api/from-url' } as never,
      res: response as never,
      parsedUrl: { pathname: null } as never,
      handle: handle as never,
      diagnostics,
      log,
    });

    expect(diagnostics.beginRequest).toHaveBeenCalledWith({
      method: 'PATCH',
      path: '/api/from-url',
    });
  });

  it('defaults missing request methods to GET', async () => {
    const diagnostics = {
      beginRequest: vi.fn(() => 'req-6'),
      completeRequest: vi.fn(() => ({ durationMs: 10 })),
      getSlowRequestThresholdMs: vi.fn(() => 2000),
    };
    const log = { warn: vi.fn(), error: vi.fn() };
    const response = new FakeResponse();
    const handle = vi.fn(async (_req, res: FakeResponse) => {
      res.emit('finish');
    });

    await handleRequestWithDiagnostics({
      req: { url: '/api/default-method' } as never,
      res: response as never,
      parsedUrl: { pathname: '/api/default-method' } as never,
      handle: handle as never,
      diagnostics,
      log,
    });

    expect(diagnostics.beginRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/default-method',
    });
  });

  it('finalizes only once when finish and close both fire', async () => {
    const diagnostics = {
      beginRequest: vi.fn(() => 'req-7'),
      completeRequest: vi.fn(() => ({ durationMs: 10 })),
      getSlowRequestThresholdMs: vi.fn(() => 2000),
    };
    const log = { warn: vi.fn(), error: vi.fn() };
    const response = new FakeResponse();
    const handle = vi.fn(async (_req, res: FakeResponse) => {
      res.writableEnded = true;
      res.emit('finish');
      res.emit('close');
    });

    await handleRequestWithDiagnostics({
      req: { method: 'GET', url: '/api/double-event' } as never,
      res: response as never,
      parsedUrl: { pathname: '/api/double-event' } as never,
      handle: handle as never,
      diagnostics,
      log,
    });

    expect(diagnostics.completeRequest).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite the response body when headers were already sent before an error', async () => {
    const diagnostics = {
      beginRequest: vi.fn(() => 'req-8'),
      completeRequest: vi.fn(() => ({ durationMs: 10 })),
      getSlowRequestThresholdMs: vi.fn(() => 2000),
    };
    const log = { warn: vi.fn(), error: vi.fn() };
    const response = new FakeResponse();
    const handle = vi.fn(async (_req, res: FakeResponse) => {
      res.statusCode = 202;
      res.headersSent = true;
      throw new Error('after headers');
    });

    await handleRequestWithDiagnostics({
      req: { method: 'GET', url: '/api/partial' } as never,
      res: response as never,
      parsedUrl: { pathname: '/api/partial' } as never,
      handle: handle as never,
      diagnostics,
      log,
    });

    expect(response.statusCode).toBe(202);
    expect(response.end).not.toHaveBeenCalled();
    expect(diagnostics.completeRequest).toHaveBeenCalledWith('req-8', {
      statusCode: 202,
      outcome: 'error',
    });
  });

  it('exposes the ignored-route rule directly', () => {
    expect(shouldInstrumentRequest('/api/metrics/stream')).toBe(false);
    expect(shouldInstrumentRequest('/api/socket')).toBe(false);
    expect(shouldInstrumentRequest('/api/system/diagnostics')).toBe(true);
  });
});
