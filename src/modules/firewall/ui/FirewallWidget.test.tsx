import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FirewallWidget from './FirewallWidget';
import type { FirewallSnapshot } from '../types';

const snapshot: FirewallSnapshot = {
  timestamp: '2026-05-16T00:00:00.000Z',
  source: 'live',
  backend: 'ufw',
  available: true,
  enabled: true,
  defaultIncoming: 'deny',
  defaultOutgoing: 'allow',
  defaultRouted: 'disabled',
  rules: [],
  checks: [],
  summary: {
    rulesCount: 8,
    allowCount: 5,
    denyCount: 1,
    rejectCount: 0,
    limitCount: 2,
    ipv6Rules: 2,
    exposedWellKnownCount: 0,
    healthScore: 94,
  },
};

describe('FirewallWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    }) as unknown as typeof fetch;
  });

  it('renders firewall posture after loading', async () => {
    await act(async () => render(<FirewallWidget />));

    await waitFor(() => {
      expect(screen.getByText('Firewall')).toBeDefined();
      expect(screen.getByText('94')).toBeDefined();
      expect(screen.getByText('Active')).toBeDefined();
      expect(screen.getByText('8')).toBeDefined();
    });
  });
});
