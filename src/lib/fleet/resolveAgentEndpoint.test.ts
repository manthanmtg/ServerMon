/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveAgentEndpoint, type ResolveAgentEndpointDeps } from './resolveAgentEndpoint';

interface FakeNode {
  _id: string;
  proxyRules?: Array<{
    name: string;
    type: string;
    enabled: boolean;
    remotePort?: number;
    status?: string;
  }>;
  capabilities?: { terminal?: boolean };
}

function makeNodeModel(doc: FakeNode | null): ResolveAgentEndpointDeps['Node'] {
  const findById = vi.fn().mockResolvedValue(doc);
  return { findById };
}

describe('resolveAgentEndpoint', () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns null when node not found', async () => {
    const Node = makeNodeModel(null);
    const r = await resolveAgentEndpoint('missing', { Node });
    expect(r).toBeNull();
  });

  it('returns null when node has no proxyRules', async () => {
    const Node = makeNodeModel({ _id: 'n' });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toBeNull();
  });

  it('returns null when node has no terminal proxy rule', async () => {
    const Node = makeNodeModel({
      _id: 'n',
      proxyRules: [{ name: 'http', type: 'http', enabled: true, remotePort: 8080 }],
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toBeNull();
  });

  it('returns null when terminal rule is not enabled', async () => {
    const Node = makeNodeModel({
      _id: 'n',
      proxyRules: [{ name: 'terminal', type: 'tcp', enabled: false, remotePort: 8001 }],
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toBeNull();
  });

  it('returns null when enabled terminal rule has no remotePort', async () => {
    const Node = makeNodeModel({
      _id: 'n',
      proxyRules: [{ name: 'terminal', type: 'tcp', enabled: true }],
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toBeNull();
  });

  it('returns endpoint for an enabled terminal rule with remotePort', async () => {
    process.env.FLEET_HUB_AUTH_TOKEN = 'secret-token';
    const Node = makeNodeModel({
      _id: 'n',
      proxyRules: [{ name: 'terminal', type: 'tcp', enabled: true, remotePort: 9001 }],
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toEqual({
      host: '127.0.0.1',
      port: 9001,
      authToken: 'secret-token',
    });
  });

  it('falls back to injected getHubAuthToken when env is unset', async () => {
    delete process.env.FLEET_HUB_AUTH_TOKEN;
    const Node = makeNodeModel({
      _id: 'n',
      proxyRules: [{ name: 'terminal', type: 'tcp', enabled: true, remotePort: 7001 }],
    });
    const r = await resolveAgentEndpoint('n', {
      Node,
      getHubAuthToken: async () => 'fallback-token',
    });
    expect(r).toEqual({
      host: '127.0.0.1',
      port: 7001,
      authToken: 'fallback-token',
    });
  });
});
