import { describe, it, expect } from 'vitest';
import { ResourcePolicyZodSchema } from './ResourcePolicy';

describe('ResourcePolicyZodSchema', () => {
  it('accepts minimal valid payload', () => {
    const parsed = ResourcePolicyZodSchema.parse({ scope: 'global' });
    expect(parsed.scope).toBe('global');
    expect(parsed.enforcement).toEqual({});
  });

  it('rejects invalid scope enum', () => {
    expect(() => ResourcePolicyZodSchema.parse({ scope: 'user' })).toThrow();
  });

  it('rejects negative limit values', () => {
    expect(() =>
      ResourcePolicyZodSchema.parse({
        scope: 'node',
        limits: { maxAgents: -1 },
      })
    ).toThrow();
  });

  it('rejects invalid enforcement value', () => {
    expect(() =>
      ResourcePolicyZodSchema.parse({
        scope: 'tag',
        enforcement: { maxAgents: 'maybe' },
      })
    ).toThrow();
  });

  it('accepts soft/hard enforcement values', () => {
    const parsed = ResourcePolicyZodSchema.parse({
      scope: 'role',
      limits: { maxAgents: 10, maxPublicRoutes: 5 },
      enforcement: { maxAgents: 'hard', maxPublicRoutes: 'soft' },
    });
    expect(parsed.enforcement.maxAgents).toBe('hard');
  });
});
