import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NodeServerMonPanel } from './NodeServerMonPanel';

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const routeIntent = {
  name: 'Orion ServerMon',
  slug: 'orion-servermon',
  domain: 'orion-servermon.apps.example.com',
  nodeId: 'node-1',
  proxyRuleName: 'servermon',
  target: { localIp: '127.0.0.1', localPort: 8912, protocol: 'http' },
  tlsEnabled: true,
  tlsProvider: 'letsencrypt',
  accessMode: 'servermon_auth',
  websocketEnabled: true,
  compression: true,
  timeoutSeconds: 300,
  maxBodyMb: 64,
};

const installedResponse = {
  servermon: {
    installed: true,
    serviceName: 'servermon.service',
    serviceState: 'running',
    serviceEnabled: true,
    port: 8912,
    healthUrl: 'http://127.0.0.1:8912/api/health',
    healthStatus: 'healthy',
    lastCheckedAt: '2026-04-29T00:00:00.000Z',
  },
  node: { _id: 'node-1', name: 'Orion', slug: 'orion', tunnelStatus: 'connected' },
  canInstall: false,
  route: {
    _id: 'route-1',
    domain: 'orion-servermon.apps.example.com',
    status: 'active',
    healthStatus: 'healthy',
    tlsEnabled: true,
  },
  defaultRouteIntent: routeIntent,
};

const missingResponse = {
  servermon: {
    installed: false,
    serviceName: 'servermon.service',
    serviceState: 'missing',
    serviceEnabled: 'unknown',
    port: 8912,
    healthUrl: 'http://127.0.0.1:8912/api/health',
    healthStatus: 'unknown',
    lastCheckedAt: null,
  },
  node: { _id: 'node-1', name: 'Orion', slug: 'orion', tunnelStatus: 'connected' },
  canInstall: true,
  route: null,
  defaultRouteIntent: routeIntent,
};

describe('NodeServerMonPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders installed service and public route details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => installedResponse,
      })
    );

    await act(async () => {
      render(<NodeServerMonPanel nodeId="node-1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('ServerMon on this node')).toBeDefined();
    });
    expect(screen.getByText('running')).toBeDefined();
    expect(screen.getAllByText('healthy')).toHaveLength(2);
    expect(screen.getByText('orion-servermon.apps.example.com')).toBeDefined();
    expect(screen.getByRole('link', { name: /Open ServerMon/ })).toHaveProperty(
      'href',
      'https://orion-servermon.apps.example.com/'
    );
  });

  it('shows validation error when MongoDB URI is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => missingResponse,
      })
    );

    await act(async () => {
      render(<NodeServerMonPanel nodeId="node-1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Install ServerMon')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start install' }));
    });

    expect(screen.getByText('MongoDB URI is required')).toBeDefined();
  });

  it('queues install and creates public route after healthy verification', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/fleet/nodes/node-1/servermon/install' && init?.method === 'POST') {
        return {
          ok: true,
          status: 202,
          json: async () => ({ queued: true, commandId: 'cmd-1', routeIntent }),
        };
      }
      if (url === '/api/fleet/routes' && init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({ route: { _id: 'route-1', ...routeIntent } }),
        };
      }
      if (String(url).startsWith('/api/fleet/logs?')) {
        return {
          ok: true,
          json: async () => ({ events: [] }),
        };
      }
      return {
        ok: true,
        json: async () => (fetchMock.mock.calls.length > 2 ? installedResponse : missingResponse),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<NodeServerMonPanel nodeId="node-1" />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('MongoDB URI')).toBeDefined();
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('MongoDB URI'), {
        target: { value: 'mongodb://db/servermon' },
      });
      fireEvent.click(screen.getByLabelText('Create public route'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start install' }));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === '/api/fleet/routes' && init?.method === 'POST'
        )
      ).toBe(true);
    });
    const installCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/fleet/nodes/node-1/servermon/install' && init?.method === 'POST'
    );
    expect(JSON.parse(String(installCall?.[1]?.body))).toMatchObject({
      mongoUri: 'mongodb://db/servermon',
      port: 8912,
      skipMongo: true,
      allowRoot: true,
      installMode: 'release',
      versionTarget: 'latest',
      createPublicRoute: true,
      routeDomain: 'orion-servermon.apps.example.com',
    });
  });

  it('queues ServerMon install with configurable release and source options', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/fleet/nodes/node-1/servermon/install' && init?.method === 'POST') {
        return {
          ok: true,
          status: 202,
          json: async () => ({ queued: true, commandId: 'cmd-1', routeIntent: null }),
        };
      }
      if (String(url).startsWith('/api/fleet/logs?')) {
        return {
          ok: true,
          json: async () => ({ events: [] }),
        };
      }
      return {
        ok: true,
        json: async () => missingResponse,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<NodeServerMonPanel nodeId="node-1" />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('MongoDB URI')).toBeDefined();
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('MongoDB URI'), {
        target: { value: 'mongodb://db/servermon' },
      });
      fireEvent.change(screen.getByLabelText('ServerMon install source'), {
        target: { value: 'version' },
      });
      fireEvent.change(screen.getByLabelText('ServerMon release version'), {
        target: { value: 'v0.1.1' },
      });
      fireEvent.change(screen.getByLabelText('ServerMon release base URL'), {
        target: { value: 'https://mirror.example.com/releases/v0.1.1' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Start install' }));
    });

    let installCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === '/api/fleet/nodes/node-1/servermon/install' && init?.method === 'POST'
    );
    expect(JSON.parse(String(installCalls.at(-1)?.[1]?.body))).toMatchObject({
      installMode: 'release',
      versionTarget: 'v0.1.1',
      releaseBaseUrl: 'https://mirror.example.com/releases/v0.1.1',
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('ServerMon install source'), {
        target: { value: 'source' },
      });
      fireEvent.change(screen.getByLabelText('ServerMon source ref'), {
        target: { value: 'develop' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Start install' }));
    });

    installCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === '/api/fleet/nodes/node-1/servermon/install' && init?.method === 'POST'
    );
    expect(JSON.parse(String(installCalls.at(-1)?.[1]?.body))).toMatchObject({
      installMode: 'source',
      sourceRef: 'develop',
    });
  });

  it('shows ServerMon install logs below the install action after queuing', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/fleet/nodes/node-1/servermon/install' && init?.method === 'POST') {
        return {
          ok: true,
          status: 202,
          json: async () => ({ queued: true, commandId: 'cmd-1', routeIntent: null }),
        };
      }
      if (String(url).startsWith('/api/fleet/logs?')) {
        return {
          ok: true,
          json: async () => ({
            events: [
              {
                _id: 'log-2',
                createdAt: '2026-04-29T16:35:02.000Z',
                service: 'agent',
                level: 'info',
                eventType: 'servermon.install.log',
                message: 'Installing dependencies...',
                metadata: { commandId: 'cmd-1' },
              },
              {
                _id: 'log-1',
                createdAt: '2026-04-29T16:35:01.000Z',
                service: 'servermon',
                level: 'info',
                eventType: 'servermon.install_queued',
                message: 'ServerMon install queued for Orion',
                metadata: { commandId: 'cmd-1' },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => missingResponse,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<NodeServerMonPanel nodeId="node-1" />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('MongoDB URI')).toBeDefined();
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('MongoDB URI'), {
        target: { value: 'mongodb://db/servermon' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Start install' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Install logs')).toBeDefined();
      expect(screen.getByText(/ServerMon install queued for Orion/)).toBeDefined();
      expect(screen.getByText(/Installing dependencies/)).toBeDefined();
    });

    const autoscroll = screen.getByRole('button', { name: 'Install log autoscroll' });
    expect(autoscroll).toHaveAttribute('aria-pressed', 'true');

    await act(async () => {
      fireEvent.click(autoscroll);
    });

    expect(autoscroll).toHaveAttribute('aria-pressed', 'false');

    const logCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith('/api/fleet/logs?')
    );
    expect(String(logCall?.[0])).toContain('nodeId=node-1');
    expect(String(logCall?.[0])).toContain('since=');
    expect(String(logCall?.[0])).toContain('limit=100');
  });
});
