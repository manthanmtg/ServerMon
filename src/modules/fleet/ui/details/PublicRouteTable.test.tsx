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
});
