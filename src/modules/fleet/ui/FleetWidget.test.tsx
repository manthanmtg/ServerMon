import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FleetWidget from './FleetWidget';

const mockNodes = [
  {
    _id: 'n1',
    status: 'online',
    tunnelStatus: 'connected',
    lastSeen: new Date().toISOString(),
    pairingVerifiedAt: new Date().toISOString(),
  },
  {
    _id: 'n2',
    status: 'online',
    tunnelStatus: 'connected',
    lastSeen: new Date().toISOString(),
    pairingVerifiedAt: new Date().toISOString(),
  },
  {
    _id: 'n3',
    status: 'offline',
    tunnelStatus: 'disconnected',
    lastSeen: new Date(Date.now() - 5 * 60_000).toISOString(),
    pairingVerifiedAt: new Date().toISOString(),
  },
];

describe('FleetWidget', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nodes: mockNodes, total: mockNodes.length }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders title and link initially (loading state)', async () => {
    await act(async () => {
      render(<FleetWidget />);
    });
    expect(screen.getByText('Fleet Overview')).toBeDefined();
    expect(screen.getByText('View fleet')).toBeDefined();
  });

  it('renders counts after fetch resolves', async () => {
    await act(async () => {
      render(<FleetWidget />);
    });

    await waitFor(() => {
      // Total
      expect(screen.getByText('3')).toBeDefined();
    });

    // Online count (2)
    expect(screen.getByText('2')).toBeDefined();
    // Offline count (1) — also labeled as 1
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThan(0);

    // Labels are present
    expect(screen.getByText('Total')).toBeDefined();
    expect(screen.getByText('Online')).toBeDefined();
    expect(screen.getByText('Degraded')).toBeDefined();
    expect(screen.getByText('Offline')).toBeDefined();
  });

  it('shows error state on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );

    await act(async () => {
      render(<FleetWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeDefined();
    });
  });
});
