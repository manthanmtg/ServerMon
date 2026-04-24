import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

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

import { NodeStatusPanel } from './NodeStatusPanel';

const baseNode = {
  _id: 'n1',
  name: 'Edge One',
  slug: 'edge-01',
  status: 'online',
  tunnelStatus: 'connected',
  lastSeen: new Date().toISOString(),
  connectedSince: new Date().toISOString(),
  agentVersion: '1.0.0',
  frpcVersion: '0.58.0',
  serviceManager: 'systemd',
  serviceStatus: 'running',
  hardware: {
    cpuCount: 4,
    totalRam: 8_000_000_000,
    osDistro: 'Ubuntu',
    arch: 'amd64',
  },
  capabilities: { terminal: true, metrics: true, fileOps: false },
  maintenance: { enabled: false },
  tags: ['prod'],
};

describe('NodeStatusPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows spinner then renders node status fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ node: baseNode, computedStatus: 'online' }),
      })
    );

    await act(async () => {
      render(<NodeStatusPanel nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('online')).toBeDefined();
    });
    expect(screen.getByText('Status')).toBeDefined();
    expect(screen.getByText('Controls')).toBeDefined();
    expect(screen.getByText('connected')).toBeDefined();
    expect(screen.getByText('1.0.0')).toBeDefined();
    expect(screen.getByText('0.58.0')).toBeDefined();
    expect(screen.getByText('systemd')).toBeDefined();
    expect(screen.getByText('running')).toBeDefined();
    expect(screen.getByText('terminal')).toBeDefined();
    expect(screen.getByText('prod')).toBeDefined();
    // fileOps is false so should not appear
    expect(screen.queryByText('fileOps')).toBeNull();
  });

  it('toggleMaintenance calls maintenance endpoint when clicked', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/maintenance')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return {
        ok: true,
        json: async () => ({ node: baseNode, computedStatus: 'online' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<NodeStatusPanel nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Enter maintenance')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Enter maintenance'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            typeof url === 'string' &&
            url.endsWith('/api/fleet/nodes/n1/maintenance') &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
  });

  it('runDiagnose calls diagnose endpoint when clicked', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/diagnose')) {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return {
        ok: true,
        json: async () => ({ node: baseNode, computedStatus: 'online' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<NodeStatusPanel nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Run diagnose')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Run diagnose'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            typeof url === 'string' &&
            url.endsWith('/api/fleet/nodes/n1/diagnose') &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
  });

  it('subscribes to the fleet event stream scoped to the nodeId', async () => {
    mockUseFleetStream.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ node: baseNode, computedStatus: 'online' }),
      })
    );

    await act(async () => {
      render(<NodeStatusPanel nodeId="n1" />);
    });
    expect(mockUseFleetStream).toHaveBeenCalled();
    const arg = mockUseFleetStream.mock.calls[0][0] as {
      nodeId?: string;
      onEvent?: unknown;
    };
    expect(arg.nodeId).toBe('n1');
    expect(typeof arg.onEvent).toBe('function');
  });

  it('shows the reboot banner and runs reconcile when in a transitional state', async () => {
    const now = new Date();
    const transitionalNode = {
      ...baseNode,
      lastBootAt: new Date(now.getTime() - 30_000).toISOString(),
      lastSeen: new Date(now.getTime() - 2_000).toISOString(),
      tunnelStatus: 'disconnected',
      proxyRules: [{ name: 'http', enabled: true, status: 'active' }],
    };

    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/reconcile')) {
        return {
          ok: true,
          json: async () => ({
            report: {
              healthy: false,
              gaps: [
                {
                  id: 'tunnel_disconnected',
                  label: 'Tunnel is not connected',
                  severity: 'warn',
                  detail: 'tunnelStatus=disconnected',
                },
              ],
              checkedAt: now.toISOString(),
            },
            diagnosticRunId: 'run-42',
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ node: transitionalNode, computedStatus: 'connecting' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<NodeStatusPanel nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('reboot-banner')).toBeDefined();
    });
    expect(screen.getByText('Recent reboot detected')).toBeDefined();
    expect(screen.getByText('Run reconcile')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Run reconcile'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            typeof url === 'string' &&
            url.endsWith('/api/fleet/nodes/n1/reconcile') &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByText('Issues found:')).toBeDefined();
      expect(screen.getByText('Tunnel is not connected')).toBeDefined();
    });
  });

  it('hides the reboot banner when node is not in a transitional state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ node: baseNode, computedStatus: 'online' }),
      })
    );

    await act(async () => {
      render(<NodeStatusPanel nodeId="n1" />);
    });
    await waitFor(() => {
      expect(screen.getByText('online')).toBeDefined();
    });
    expect(screen.queryByTestId('reboot-banner')).toBeNull();
  });
});
