import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { FrpServerControl } from './FrpServerControl';

const baseState = {
  enabled: false,
  runtimeState: 'stopped',
  bindPort: 7000,
  vhostHttpPort: 8080,
  vhostHttpsPort: 8443,
  subdomainHost: 'hub.example.com',
  configVersion: 3,
  generatedConfigHash: 'abc123',
  activeConnections: 0,
  connectedNodeIds: [],
};

describe('FrpServerControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders initial state from /api/fleet/server', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ state: baseState }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<FrpServerControl />);
    });

    await waitFor(() => {
      expect(screen.getByText('7000')).toBeDefined();
    });
    expect(screen.getByText('8080')).toBeDefined();
    expect(screen.getByText('hub.example.com')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/fleet/server');
  });

  it('enable toggle opens confirm then posts', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ state: { ...baseState, enabled: true } }),
        };
      }
      return { ok: true, json: async () => ({ state: baseState }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<FrpServerControl />);
    });

    await waitFor(() => {
      expect(screen.getByText('Enable FRP server')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Enable FRP server'));
    });

    await waitFor(() => {
      expect(screen.getByText('Enable FRP server?')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Enable'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === '/api/fleet/server' &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
  });
});
