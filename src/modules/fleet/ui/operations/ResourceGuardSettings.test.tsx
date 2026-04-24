import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { ResourceGuardSettings } from './ResourceGuardSettings';

describe('ResourceGuardSettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders policies and usage from fetches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/fleet/resource-policies')) {
          return {
            ok: true,
            json: async () => ({
              policies: [
                {
                  _id: 'rp1',
                  scope: 'global',
                  limits: { maxAgents: 10 },
                  enforcement: {},
                },
              ],
            }),
          };
        }
        if (url.startsWith('/api/fleet/nodes')) {
          return {
            ok: true,
            json: async () => ({ nodes: [{}, {}, {}], total: 3 }),
          };
        }
        if (url.startsWith('/api/fleet/routes')) {
          return {
            ok: true,
            json: async () => ({ routes: [{}, {}], total: 2 }),
          };
        }
        return { ok: true, json: async () => ({}) };
      })
    );

    await act(async () => {
      render(<ResourceGuardSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText(/maxAgents=10/)).toBeDefined();
    });
    expect(screen.getByText(/Nodes: 3/)).toBeDefined();
    expect(screen.getByText(/Public routes: 2/)).toBeDefined();
  });

  it('clicking New resource policy opens form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ policies: [], nodes: [], routes: [] }),
      }))
    );

    await act(async () => {
      render(<ResourceGuardSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('New resource policy')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New resource policy'));
    });

    await waitFor(() => {
      expect(screen.getByText('Save policy')).toBeDefined();
    });
  });

  it('renders live usage beside limits in the form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/fleet/resource-policies')) {
          return {
            ok: true,
            json: async () => ({ policies: [] }),
          };
        }
        if (url.startsWith('/api/fleet/nodes')) {
          return {
            ok: true,
            json: async () => ({ nodes: [], total: 7 }),
          };
        }
        if (url.startsWith('/api/fleet/routes')) {
          return {
            ok: true,
            json: async () => ({ routes: [], total: 4 }),
          };
        }
        return { ok: true, json: async () => ({}) };
      })
    );

    await act(async () => {
      render(<ResourceGuardSettings />);
    });

    await waitFor(() => {
      expect(screen.getByText('New resource policy')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New resource policy'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('usage-maxAgents').textContent).toContain('Live: 7');
    });
    expect(screen.getByTestId('usage-maxPublicRoutes').textContent).toContain('Live: 4');
    expect(screen.getByTestId('usage-maxActiveTerminals').textContent).toContain('Live: —');
    expect(screen.queryByTestId('usage-maxProxiesPerNode')).toBeNull();
    expect(screen.queryByTestId('usage-logStorageMb')).toBeNull();
  });

  it('uses /api/fleet/nodes?limit=0 and /api/fleet/routes?limit=0 for usage counters', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('/api/fleet/resource-policies')) {
        return { ok: true, json: async () => ({ policies: [] }) };
      }
      if (url.startsWith('/api/fleet/nodes')) {
        return { ok: true, json: async () => ({ nodes: [], total: 1 }) };
      }
      if (url.startsWith('/api/fleet/routes')) {
        return { ok: true, json: async () => ({ routes: [], total: 1 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ResourceGuardSettings />);
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/fleet/nodes?limit=0')).toBe(
        true
      );
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/fleet/routes?limit=0')).toBe(
      true
    );
  });
});
