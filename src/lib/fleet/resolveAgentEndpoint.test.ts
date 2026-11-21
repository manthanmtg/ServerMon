/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveAgentEndpoint, type ResolveAgentEndpointDeps } from './resolveAgentEndpoint';

interface FakeNode {
  _id: string;
  slug?: string;
  proxyRules?: Array<{
    name: string;
    type: string;
    enabled: boolean;
    remotePort?: number;
    status?: string;
  }>;
  capabilities?: { terminal?: boolean };
  ptyBridge?: { port?: number; authToken?: string };
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

  it('returns null when the node has not reported a pty bridge token yet', async () => {
    const Node = makeNodeModel({
      _id: 'n',
      slug: 'orion',
      capabilities: { terminal: true },
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toBeNull();
  });

  it('falls back to the deterministic terminal bridge port when no proxy rule is persisted', async () => {
    const Node = makeNodeModel({
      _id: 'n',
      slug: 'orion',
      capabilities: { terminal: true },
      ptyBridge: { port: 8918, authToken: 'agent-token' },
      proxyRules: [{ name: 'http', type: 'http', enabled: true, remotePort: 8080 }],
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toEqual({
      host: '127.0.0.1',
      port: 39288,
      authToken: 'agent-token',
    });
  });

  it('returns null when terminal capability is disabled', async () => {
    const Node = makeNodeModel({
      _id: 'n',
      capabilities: { terminal: false },
      ptyBridge: { port: 8918, authToken: 'agent-token' },
      proxyRules: [{ name: 'terminal-bridge', type: 'tcp', enabled: true, remotePort: 8001 }],
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toBeNull();
  });

  it('uses the deterministic port when the bridge rule has no remotePort', async () => {
    const Node = makeNodeModel({
      _id: 'n',
      slug: 'orion',
      capabilities: { terminal: true },
      ptyBridge: { port: 8918, authToken: 'agent-token' },
      proxyRules: [{ name: 'terminal-bridge', type: 'tcp', enabled: true }],
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toEqual({
      host: '127.0.0.1',
      port: 39288,
      authToken: 'agent-token',
    });
  });

  it('returns endpoint for an enabled terminal rule with remotePort', async () => {
    const Node = makeNodeModel({
      _id: 'n',
      ptyBridge: { port: 8918, authToken: 'agent-token' },
      proxyRules: [{ name: 'terminal-bridge', type: 'tcp', enabled: true, remotePort: 9001 }],
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toEqual({
      host: '127.0.0.1',
      port: 9001,
      authToken: 'agent-token',
    });
  });

  it('keeps supporting the legacy terminal proxy rule name', async () => {
    const Node = makeNodeModel({
      _id: 'n',
      ptyBridge: { port: 8918, authToken: 'agent-token' },
      proxyRules: [{ name: 'terminal', type: 'tcp', enabled: true, remotePort: 7001 }],
    });
    const r = await resolveAgentEndpoint('n', { Node });
    expect(r).toEqual({
      host: '127.0.0.1',
      port: 7001,
      authToken: 'agent-token',
    });
  });
});
