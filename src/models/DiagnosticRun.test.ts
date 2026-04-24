import { describe, it, expect } from 'vitest';
import { DiagnosticRunZodSchema } from './DiagnosticRun';

describe('DiagnosticRunZodSchema', () => {
  it('accepts minimal valid payload with defaults', () => {
    const parsed = DiagnosticRunZodSchema.parse({
      kind: 'client',
      targetId: 'node-1',
    });
    expect(parsed.steps).toEqual([]);
    expect(parsed.sanitizedReportExportable).toBe(true);
    expect(parsed.startedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid kind enum', () => {
    expect(() => DiagnosticRunZodSchema.parse({ kind: 'server', targetId: 'x' })).toThrow();
  });

  it('rejects invalid step status enum', () => {
    expect(() =>
      DiagnosticRunZodSchema.parse({
        kind: 'route',
        targetId: 'r1',
        steps: [{ step: 'ping', status: 'maybe' }],
      })
    ).toThrow();
  });

  it('accepts valid steps', () => {
    const parsed = DiagnosticRunZodSchema.parse({
      kind: 'route',
      targetId: 'r1',
      steps: [
        { step: 'dns', status: 'pass', durationMs: 10 },
        {
          step: 'tls',
          status: 'fail',
          evidence: 'handshake failed',
          likelyCause: 'expired cert',
          recommendedFix: 'renew',
        },
      ],
    });
    expect(parsed.steps).toHaveLength(2);
  });
});
