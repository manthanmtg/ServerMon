import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const { mockUseFleetStream } = vi.hoisted(() => ({
  mockUseFleetStream: vi.fn((_opts: unknown) => ({
    connected: false,
    error: null as string | null,
    lastEvent: null as { kind: string; at: string } | null,
  })),
}));

vi.mock('../lib/useFleetStream', () => ({
  useFleetStream: mockUseFleetStream,
}));

import { FleetStatsBanner } from './FleetStatsBanner';

describe('FleetStatsBanner', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders all stat labels initially (zero counts)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(() => {
            /* never resolves */
          })
      )
    );
    await act(async () => {
      render(<FleetStatsBanner />);
    });
    expect(screen.getByText('Total Nodes')).toBeDefined();
    expect(screen.getByText('Online')).toBeDefined();
    expect(screen.getByText('Connecting')).toBeDefined();
    expect(screen.getByText('Offline')).toBeDefined();
    expect(screen.getByText('Error')).toBeDefined();
  });

  it('renders counts after fetch resolves', async () => {
    const now = new Date();
    const nodes = [
      {
        status: 'online',
        tunnelStatus: 'connected',
        lastSeen: now.toISOString(),
        pairingVerifiedAt: now.toISOString(),
      },
      {
        status: 'online',
        tunnelStatus: 'connected',
        lastSeen: now.toISOString(),
        pairingVerifiedAt: now.toISOString(),
      },
      {
        status: 'offline',
        tunnelStatus: 'disconnected',
        lastSeen: new Date(now.getTime() - 10 * 60_000).toISOString(),
        pairingVerifiedAt: now.toISOString(),
      },
      {
        status: 'unpaired',
        tunnelStatus: 'disconnected',
        pairingVerifiedAt: null,
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nodes, total: nodes.length }),
      })
    );

    await act(async () => {
      render(<FleetStatsBanner />);
    });

    await waitFor(() => {
      // Total = 4
      expect(screen.getByText('4')).toBeDefined();
    });

    // Should contain 2 (online) and 1 (offline); unpaired nodes are counted in total.
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThan(0);
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(1);
  });

  it('silently ignores fetch failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );

    await act(async () => {
      render(<FleetStatsBanner />);
    });
    // Still shows labels + 0s
    expect(screen.getByText('Total Nodes')).toBeDefined();
  });

  it('subscribes to the fleet event stream with an onEvent handler', async () => {
    mockUseFleetStream.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nodes: [], total: 0 }),
      })
    );

    await act(async () => {
      render(<FleetStatsBanner />);
    });
    expect(mockUseFleetStream).toHaveBeenCalled();
    const arg = mockUseFleetStream.mock.calls[0][0] as { onEvent?: unknown };
    expect(typeof arg.onEvent).toBe('function');
  });
});
