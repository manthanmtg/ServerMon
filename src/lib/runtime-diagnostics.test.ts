import { describe, expect, it } from 'vitest';
import { getRuntimeDiagnostics } from './runtime-diagnostics';

describe('runtime diagnostics', () => {
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
});
