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

import { NodeGrid } from './NodeGrid';

const mockNodes = [
  {
    _id: 'n1',
    name: 'Edge One',
    slug: 'edge-01',
    status: 'online',
    tunnelStatus: 'connected',
    tags: ['prod'],
    lastSeen: new Date().toISOString(),
    agentVersion: '1.0.0',
    frpcVersion: '0.58.0',
    pairingVerifiedAt: new Date().toISOString(),
    proxyRules: [],
  },
  {
    _id: 'n2',
    name: 'Edge Two',
    slug: 'edge-02',
    status: 'online',
    tunnelStatus: 'connected',
    tags: ['dev'],
    lastSeen: new Date().toISOString(),
    agentVersion: '1.0.0',
    frpcVersion: '0.58.0',
    pairingVerifiedAt: new Date().toISOString(),
    proxyRules: [],
  },
];

describe('NodeGrid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows loading spinner initially', async () => {
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
      render(<NodeGrid />);
    });
    expect(screen.getByRole('status', { name: /loading/i })).toBeDefined();
  });

  it('renders nodes after fetch resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nodes: mockNodes, total: mockNodes.length }),
      })
    );

    await act(async () => {
      render(<NodeGrid />);
    });

    await waitFor(() => {
      expect(screen.getByText('Edge One')).toBeDefined();
      expect(screen.getByText('Edge Two')).toBeDefined();
    });
  });

  it('shows empty state when no nodes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nodes: [], total: 0 }),
      })
    );

    await act(async () => {
      render(<NodeGrid />);
    });

    await waitFor(() => {
      expect(screen.getByText(/No nodes yet/)).toBeDefined();
      expect(screen.getByText(/Onboard an agent/)).toBeDefined();
    });
  });

  it('shows error banner on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );

    await act(async () => {
      render(<NodeGrid />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Error: HTTP 500/)).toBeDefined();
    });
  });

  it('passes search, tag, and status to the API call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ nodes: [], total: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<NodeGrid search="edge" tag="prod" status="online" />);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('search=edge');
    expect(url).toContain('tag=prod');
    expect(url).toContain('status=online');
    expect(url).toContain('limit=200');
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
      render(<NodeGrid />);
    });
    expect(mockUseFleetStream).toHaveBeenCalled();
    const arg = mockUseFleetStream.mock.calls[0][0] as { onEvent?: unknown };
    expect(typeof arg.onEvent).toBe('function');
  });
});
