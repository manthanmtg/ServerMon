import { describe, it, expect } from 'vitest';
import { FrpServerStateZodSchema } from './FrpServerState';

describe('FrpServerStateZodSchema', () => {
  it('accepts minimal payload and applies defaults', () => {
    const parsed = FrpServerStateZodSchema.parse({});
    expect(parsed.key).toBe('global');
    expect(parsed.enabled).toBe(false);
    expect(parsed.runtimeState).toBe('stopped');
    expect(parsed.bindPort).toBe(7000);
    expect(parsed.vhostHttpPort).toBe(8080);
    expect(parsed.configVersion).toBe(0);
    expect(parsed.activeConnections).toBe(0);
    expect(parsed.connectedNodeIds).toEqual([]);
  });

  it('rejects invalid runtimeState', () => {
    expect(() => FrpServerStateZodSchema.parse({ runtimeState: 'flying' })).toThrow();
  });

  it('accepts optional fields', () => {
    const parsed = FrpServerStateZodSchema.parse({
      vhostHttpsPort: 8443,
      subdomainHost: 'tunnels.example.com',
      authTokenHash: 'abc',
      authTokenPrefix: 'pfx',
      generatedConfigHash: 'hash',
      lastRestartAt: new Date(),
      lastError: { code: 'E1', message: 'boom', occurredAt: new Date() },
    });
    expect(parsed.vhostHttpsPort).toBe(8443);
    expect(parsed.subdomainHost).toBe('tunnels.example.com');
    expect(parsed.lastError?.code).toBe('E1');
  });
});
