import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { AgentUpdateCenter } from './AgentUpdateCenter';

describe('AgentUpdateCenter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders existing jobs and version inventory', async () => {
    const jobs = [
      {
        _id: 'j1',
        targets: { mode: 'fleet' },
        versionTarget: '1.2.0',
        status: 'running',
      },
    ];
    const nodes = [
      { _id: 'n1', name: 'A', slug: 'a', agentVersion: '1.1.0' },
      { _id: 'n2', name: 'B', slug: 'b', agentVersion: '1.1.0' },
      { _id: 'n3', name: 'C', slug: 'c', agentVersion: '1.2.0' },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/fleet/nodes')) {
          return { ok: true, json: async () => ({ nodes, total: nodes.length }) };
        }
        return { ok: true, json: async () => ({ jobs }) };
      })
    );

    await act(async () => {
      render(<AgentUpdateCenter />);
    });

    await waitFor(() => {
      expect(screen.getByText('1.2.0')).toBeDefined();
    });
    expect(screen.getByText(/Agent version inventory/)).toBeDefined();
  });

  it('clicking New update job opens form and submits', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url === '/api/fleet/updates') {
        return {
          ok: true,
          json: async () => ({ job: { _id: 'new', versionTarget: '2.0.0' } }),
        };
      }
      if (url.startsWith('/api/fleet/nodes')) {
        return { ok: true, json: async () => ({ nodes: [] }) };
      }
      return { ok: true, json: async () => ({ jobs: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<AgentUpdateCenter />);
    });

    await waitFor(() => {
      expect(screen.getByText('New update job')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New update job'));
    });

    await waitFor(() => {
      expect(screen.getByText('Create job')).toBeDefined();
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Version target'), {
        target: { value: '2.0.0' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Create job'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === '/api/fleet/updates' &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
  });
});
