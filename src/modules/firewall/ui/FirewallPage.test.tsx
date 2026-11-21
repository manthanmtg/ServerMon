import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FirewallPage, { getFilteredFirewallRules } from './FirewallPage';
import type { FirewallSnapshot } from '../types';

vi.mock('@/components/ui/skeleton', () => ({
  PageSkeleton: ({ statCards }: { statCards: number }) => (
    <div data-testid="page-skeleton" data-stat-cards={statCards}>
      Loading...
    </div>
  ),
}));

const snapshot: FirewallSnapshot = {
  timestamp: '2026-05-16T00:00:00.000Z',
  source: 'live',
  backend: 'ufw',
  available: true,
  enabled: true,
  defaultIncoming: 'deny',
  defaultOutgoing: 'allow',
  defaultRouted: 'disabled',
  rules: [
    {
      id: 'ufw-1',
      to: '22/tcp',
      action: 'limit',
      direction: 'in',
      from: 'Anywhere',
      protocol: 'tcp',
      port: '22',
      addressFamily: 'ipv4',
      raw: '22/tcp LIMIT IN Anywhere',
    },
    {
      id: 'ufw-2',
      to: '5432/tcp',
      action: 'allow',
      direction: 'in',
      from: '10.0.0.0/8',
      protocol: 'tcp',
      port: '5432',
      addressFamily: 'ipv4',
      raw: '5432/tcp ALLOW IN 10.0.0.0/8',
    },
  ],
  checks: [
    {
      id: 'firewall-active',
      title: 'Firewall is active',
      status: 'pass',
      severity: 'high',
      details: 'UFW is active.',
    },
  ],
  summary: {
    rulesCount: 2,
    allowCount: 1,
    denyCount: 0,
    rejectCount: 0,
    limitCount: 1,
    ipv6Rules: 0,
    exposedWellKnownCount: 0,
    healthScore: 98,
  },
};

function createJsonResponse(payload: FirewallSnapshot): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createPendingFetchResponse(): Promise<Response> {
  return new Promise(() => {});
}

describe('getFilteredFirewallRules', () => {
  it('filters rules by action and search query', () => {
    expect(getFilteredFirewallRules(snapshot.rules, 'allow', '5432')).toHaveLength(1);
    expect(getFilteredFirewallRules(snapshot.rules, 'limit', 'ssh')).toHaveLength(1);
  });
});

describe('FirewallPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => createJsonResponse(snapshot));
  });

  it('shows skeleton while loading', () => {
    global.fetch = vi.fn(async () => createPendingFetchResponse());
    render(<FirewallPage />);
    expect(screen.getByTestId('page-skeleton')).toBeDefined();
  });

  it('renders firewall summary, checks, and rules', async () => {
    await act(async () => render(<FirewallPage />));

    await waitFor(() => {
      expect(screen.getByText('Firewall Posture')).toBeDefined();
      expect(screen.getByText('Default Incoming')).toBeDefined();
      expect(screen.getByText('Firewall is active')).toBeDefined();
      expect(screen.getByText('5432/tcp')).toBeDefined();
      expect(screen.getByText('10.0.0.0/8')).toBeDefined();
    });
  });
});
