import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { FleetEndpointRunner } from './FleetEndpointRunner';

describe('FleetEndpointRunner', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mounts and loads endpoint dropdown options', async () => {
    const endpoints = [
      { _id: 'e1', name: 'Restart Service', slug: 'restart' },
      { _id: 'e2', name: 'Collect Diagnostics', slug: 'diag' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/modules/endpoints')) {
          return { ok: true, json: async () => ({ endpoints, total: endpoints.length }) };
        }
        if (url.startsWith('/api/fleet/nodes')) {
          return { ok: true, json: async () => ({ nodes: [] }) };
        }
        return { ok: true, json: async () => ({ events: [] }) };
      })
    );

    await act(async () => {
      render(<FleetEndpointRunner />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Endpoint')).toBeDefined();
    });
    // dropdown options present
    expect(screen.getByText(/Restart Service/)).toBeDefined();
    expect(screen.getByText(/Collect Diagnostics/)).toBeDefined();
  });

  it('switches inputs based on target mode selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/modules/endpoints')) {
          return { ok: true, json: async () => ({ endpoints: [] }) };
        }
        if (url.startsWith('/api/fleet/nodes')) {
          return {
            ok: true,
            json: async () => ({
              nodes: [{ _id: 'n1', name: 'Alpha', slug: 'alpha' }],
            }),
          };
        }
        return { ok: true, json: async () => ({ events: [] }) };
      })
    );

    await act(async () => {
      render(<FleetEndpointRunner />);
    });

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Fleet' })).toBeDefined();
    });

    // Fleet mode: no extra input
    expect(screen.queryByLabelText('Tag')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();

    // Switch to Tag
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Tag' }));
    });
    expect(screen.getByLabelText('Tag')).toBeDefined();

    // Switch to Node List
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Node List' }));
    });
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeDefined();
    });
    expect(screen.getByText(/Alpha/)).toBeDefined();
  });

  it('Dispatch posts /api/fleet/endpoint-exec with override target', async () => {
    const endpoints = [{ _id: 'e1', name: 'Restart', slug: 'restart' }];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url === '/api/fleet/endpoint-exec') {
        return {
          ok: true,
          json: async () => ({
            dispatched: ['n1'],
            endpointId: 'e1',
            endpointSlug: 'restart',
            status: 'queued',
            target: { mode: 'fleet', nodeIds: [] },
          }),
        };
      }
      if (url.startsWith('/api/modules/endpoints')) {
        return { ok: true, json: async () => ({ endpoints }) };
      }
      if (url.startsWith('/api/fleet/nodes')) {
        return { ok: true, json: async () => ({ nodes: [] }) };
      }
      return { ok: true, json: async () => ({ events: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<FleetEndpointRunner />);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Endpoint')).toBeDefined();
    });

    // Select the endpoint
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Endpoint'), {
        target: { value: 'e1' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Dispatch'));
    });

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === '/api/fleet/endpoint-exec' &&
          (init as { method?: string } | undefined)?.method === 'POST'
      );
      expect(posted).toBeDefined();
      const body = JSON.parse((posted![1] as { body: string }).body);
      expect(body.endpointId).toBe('e1');
      expect(body.overrideTarget.mode).toBe('fleet');
    });
  });
});
