import { describe, it, expect } from 'vitest';
import { AgentUpdateJobZodSchema } from './AgentUpdateJob';

describe('AgentUpdateJobZodSchema', () => {
  it('accepts minimal valid payload with defaults', () => {
    const parsed = AgentUpdateJobZodSchema.parse({
      targets: { mode: 'fleet' },
      versionTarget: '1.2.3',
    });
    expect(parsed.versionSource).toBe('github');
    expect(parsed.strategy.batchSize).toBe(5);
    expect(parsed.strategy.pauseOnFailure).toBe(true);
    expect(parsed.strategy.autoStopThresholdPct).toBe(30);
    expect(parsed.status).toBe('pending');
    expect(parsed.perNode).toEqual([]);
  });

  it('rejects invalid targets mode', () => {
    expect(() =>
      AgentUpdateJobZodSchema.parse({
        targets: { mode: 'broadcast' },
        versionTarget: '1.0.0',
      })
    ).toThrow();
  });

  it('rejects missing versionTarget', () => {
    expect(() => AgentUpdateJobZodSchema.parse({ targets: { mode: 'fleet' } })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() =>
      AgentUpdateJobZodSchema.parse({
        targets: { mode: 'fleet' },
        versionTarget: '1.0.0',
        status: 'exploded',
      })
    ).toThrow();
  });
});
