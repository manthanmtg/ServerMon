import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { PublicRouteTable } from './PublicRouteTable';

const mockRoutes = [
  {
    _id: 'r1',
    name: 'My App',
    slug: 'my-app',
    domain: 'app.example.com',
    status: 'active',
    accessMode: 'servermon_auth',
    tlsEnabled: true,
    tlsProvider: 'letsencrypt',
    nodeId: 'n1',
    proxyRuleName: 'my-app',
    target: {
      localIp: '127.0.0.1',
      localPort: 8080,
      protocol: 'http',
    },
    websocketEnabled: false,
    timeoutSeconds: 60,
    maxBodyMb: 32,
    compression: true,
    headers: {},
  },
];

describe('PublicRouteTable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows spinner then renders routes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ routes: mockRoutes, total: 1 }),
      })
    );

    await act(async () => {
      render(<PublicRouteTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('My App')).toBeDefined();
    });
    expect(screen.getByText('app.example.com')).toBeDefined();
    expect(screen.getByText('active')).toBeDefined();
  });

  it('shows empty state when no routes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ routes: [], total: 0 }),
      })
    );

    await act(async () => {
      render(<PublicRouteTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/No public routes yet/)).toBeDefined();
    });
  });

  it('clicking Add route opens the Expose Service wizard modal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ routes: [], total: 0 }),
      })
    );

    await act(async () => {
      render(<PublicRouteTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Add route')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add route'));
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    expect(screen.getByText('Expose service')).toBeDefined();
  });

  it('delete calls DELETE endpoint and removes row', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return { ok: true, json: async () => ({ deleted: true }) };
      }
      return {
        ok: true,
        json: async () => ({ routes: mockRoutes, total: 1 }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<PublicRouteTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('My App')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Delete route My App'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            typeof url === 'string' &&
            url.endsWith('/api/fleet/routes/r1') &&
            (init as { method?: string } | undefined)?.method === 'DELETE'
        )
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText('My App')).toBeNull();
    });
  });

  it('clicking Edit opens a prefilled modal and saves route changes', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/fleet/templates') {
        return { ok: true, json: async () => ({ templates: [] }) };
      }
      if (url === '/api/fleet/server') {
        return {
          ok: true,
          json: async () => ({ state: { subdomainHost: 'example.com' }, envDefaults: {} }),
        };
      }
      if (url === '/api/fleet/nodes?limit=200') {
        return {
          ok: true,
          json: async () => ({
            nodes: [
              {
                _id: 'n1',
                name: 'Node One',
                slug: 'node-one',
                proxyRules: [
                  {
                    name: 'my-app',
                    type: 'http',
                    localIp: '127.0.0.1',
                    localPort: 8080,
                  },
                ],
              },
            ],
          }),
        };
      }
      if (init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({
            route: { ...mockRoutes[0], name: 'Updated App' },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ routes: mockRoutes, total: 1 }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<PublicRouteTable nodeId="n1" />);
    });

    await waitFor(() => {
      expect(screen.getByText('My App')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Edit route My App'));
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    expect(screen.getByText('Edit route')).toBeDefined();

    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Updated App' } });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Skip & continue/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === '/api/fleet/routes/r1' &&
            (init as { method?: string } | undefined)?.method === 'PATCH' &&
            String((init as { body?: string } | undefined)?.body).includes('Updated App')
        )
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByText('Updated App')).toBeDefined();
    });
  });
});
