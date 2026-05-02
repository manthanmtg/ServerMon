/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeDiagnostics } from './runtime-diagnostics';

describe('runtime diagnostics', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks in-flight and completed requests', () => {
    const diagnostics = getRuntimeDiagnostics();
    const requestId = diagnostics.beginRequest({ method: 'GET', path: '/api/test' });

    const midSnapshot = diagnostics.getSnapshot();
    expect(midSnapshot.requests.inFlight.some((request) => request.id === requestId)).toBe(true);

    const completed = diagnostics.completeRequest(requestId, {
      statusCode: 200,
      outcome: 'completed',
    });

    expect(completed?.path).toBe('/api/test');
    expect(completed?.statusCode).toBe(200);

    const finalSnapshot = diagnostics.getSnapshot();
    expect(finalSnapshot.requests.inFlight.some((request) => request.id === requestId)).toBe(false);
    expect(finalSnapshot.requests.recent.some((request) => request.id === requestId)).toBe(true);
  });

  it('returns null when completing an unknown request id', () => {
    const diagnostics = getRuntimeDiagnostics();

    expect(
      diagnostics.completeRequest('missing-request-id', {
        statusCode: 404,
        outcome: 'completed',
      })
    ).toBeNull();
  });

  it('orders in-flight requests by age with the oldest first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T10:00:00.000Z'));
    const diagnostics = getRuntimeDiagnostics();
    const olderRequestId = diagnostics.beginRequest({ method: 'GET', path: '/api/older' });

    vi.setSystemTime(new Date('2026-05-02T10:00:05.000Z'));
    const newerRequestId = diagnostics.beginRequest({ method: 'POST', path: '/api/newer' });

    vi.setSystemTime(new Date('2026-05-02T10:00:08.000Z'));
    const snapshot = diagnostics.getSnapshot();

    const trackedRequests = snapshot.requests.inFlight.filter((request) =>
      [olderRequestId, newerRequestId].includes(request.id)
    );
    expect(trackedRequests.map((request) => request.id)).toEqual([olderRequestId, newerRequestId]);
    expect(trackedRequests.map((request) => request.ageMs)).toEqual([8000, 3000]);

    diagnostics.completeRequest(olderRequestId, { statusCode: 200, outcome: 'completed' });
    diagnostics.completeRequest(newerRequestId, { statusCode: 200, outcome: 'completed' });
  });

  it('classifies aborted and errored requests as recent slow requests', () => {
    const diagnostics = getRuntimeDiagnostics();
    const abortedRequestId = diagnostics.beginRequest({ method: 'GET', path: '/api/aborted' });
    const erroredRequestId = diagnostics.beginRequest({ method: 'POST', path: '/api/errored' });

    diagnostics.completeRequest(abortedRequestId, {
      statusCode: 499,
      outcome: 'aborted',
    });
    diagnostics.completeRequest(erroredRequestId, {
      statusCode: 500,
      outcome: 'error',
    });

    const snapshot = diagnostics.getSnapshot();

    expect(snapshot.requests.recentSlow.some((request) => request.id === abortedRequestId)).toBe(
      true
    );
    expect(snapshot.requests.recentSlow.some((request) => request.id === erroredRequestId)).toBe(
      true
    );
  });

  it('classifies completed requests as slow once they meet the threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T11:00:00.000Z'));
    const diagnostics = getRuntimeDiagnostics();
    const requestId = diagnostics.beginRequest({ method: 'GET', path: '/api/slow' });

    vi.setSystemTime(new Date(Date.now() + diagnostics.getSlowRequestThresholdMs() + 1));
    const completed = diagnostics.completeRequest(requestId, {
      statusCode: 200,
      outcome: 'completed',
    });

    const snapshot = diagnostics.getSnapshot();

    expect(completed?.durationMs).toBe(diagnostics.getSlowRequestThresholdMs() + 1);
    expect(snapshot.requests.recentSlow.some((request) => request.id === requestId)).toBe(true);
  });

  it('keeps only the latest 100 completed requests', () => {
    const diagnostics = getRuntimeDiagnostics();
    const requestIds = Array.from({ length: 105 }, (_, index) => {
      const requestId = diagnostics.beginRequest({
        method: 'GET',
        path: `/api/recent/${index}`,
      });
      diagnostics.completeRequest(requestId, {
        statusCode: 200,
        outcome: 'completed',
      });
      return requestId;
    });

    const snapshot = diagnostics.getSnapshot();

    expect(snapshot.requests.recent).toHaveLength(100);
    expect(snapshot.requests.recent[0]?.id).toBe(requestIds.at(-1));
    expect(snapshot.requests.recent.some((request) => request.id === requestIds[0])).toBe(false);
  });
});
