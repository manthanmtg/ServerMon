import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodeCard, type NodeCardData } from './NodeCard';

function makeNode(overrides: Partial<NodeCardData> = {}): NodeCardData {
  return {
    _id: 'n1',
    name: 'Edge One',
    slug: 'edge-01',
    status: 'online',
    tunnelStatus: 'connected',
    tags: ['prod', 'us-east'],
    lastSeen: new Date().toISOString(),
    agentVersion: '1.2.3',
    frpcVersion: '0.58.0',
    pairingVerifiedAt: new Date().toISOString(),
    proxyRules: [
      { name: 'http', status: 'active', enabled: true },
      { name: 'ssh', status: 'active', enabled: false },
    ],
    ...overrides,
  };
}

describe('NodeCard', () => {
  it('renders online status variant for a healthy node', () => {
    const now = new Date();
    const node = makeNode({ lastSeen: now.toISOString() });
    render(<NodeCard node={node} now={now} />);

    expect(screen.getByText('Edge One')).toBeDefined();
    expect(screen.getByText('edge-01')).toBeDefined();
    expect(screen.getByText('online')).toBeDefined();
    expect(screen.getByText('1.2.3')).toBeDefined();
    expect(screen.getByText('0.58.0')).toBeDefined();
    expect(screen.getByText('prod')).toBeDefined();
    expect(screen.getByText('us-east')).toBeDefined();
    // 1 enabled proxy
    expect(screen.getByText('1 proxies')).toBeDefined();
  });

  it('renders offline status when lastSeen is stale', () => {
    const now = new Date();
    const node = makeNode({
      lastSeen: new Date(now.getTime() - 10 * 60_000).toISOString(),
    });
    render(<NodeCard node={node} now={now} />);
    expect(screen.getByText('offline')).toBeDefined();
  });

  it('renders degraded status when tunnel is reconnecting', () => {
    const now = new Date();
    const node = makeNode({
      tunnelStatus: 'reconnecting',
      lastSeen: now.toISOString(),
    });
    render(<NodeCard node={node} now={now} />);
    expect(screen.getByText('degraded')).toBeDefined();
  });

  it('renders unpaired status when no pairingVerifiedAt', () => {
    const now = new Date();
    const node = makeNode({
      pairingVerifiedAt: null,
      lastSeen: now.toISOString(),
    });
    render(<NodeCard node={node} now={now} />);
    expect(screen.getByText('unpaired')).toBeDefined();
  });

  it('shows "No proxies" when node has no proxy rules', () => {
    const now = new Date();
    const node = makeNode({ proxyRules: [] });
    render(<NodeCard node={node} now={now} />);
    expect(screen.getByText('No proxies')).toBeDefined();
  });

  it('shows em dashes when agent/frpc versions are missing', () => {
    const now = new Date();
    const node = makeNode({ agentVersion: undefined, frpcVersion: undefined });
    render(<NodeCard node={node} now={now} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('links to the node detail page using its slug', () => {
    const node = makeNode({ slug: 'edge-42' });
    const { container } = render(<NodeCard node={node} />);
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('/fleet/edge-42');
  });

  it('renders a pulsing transition badge when lastBootAt is recent and tunnel is disconnected', () => {
    const now = new Date();
    const node = makeNode({
      lastBootAt: new Date(now.getTime() - 20_000).toISOString(),
      lastSeen: new Date(now.getTime() - 2_000).toISOString(),
      tunnelStatus: 'disconnected',
    });
    const { container } = render(<NodeCard node={node} now={now} />);
    expect(screen.getByText('starting agent')).toBeDefined();
    const pulsing = container.querySelector('.animate-pulse');
    expect(pulsing).not.toBeNull();
    expect(pulsing?.textContent).toBe('starting agent');
  });
});
