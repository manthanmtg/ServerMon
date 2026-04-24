import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { NginxManager } from './NginxManager';

const baseState = {
  managed: false,
  runtimeState: 'unknown',
  managedDir: '/etc/nginx/servermon',
  detectedConflicts: [],
};

describe('NginxManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders initial nginx state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ state: baseState }),
      })
    );

    await act(async () => {
      render(<NginxManager />);
    });

    await waitFor(() => {
      expect(screen.getByText('unmanaged')).toBeDefined();
    });
    expect(screen.getByText('/etc/nginx/servermon')).toBeDefined();
    expect(screen.getByText('Enable managed mode')).toBeDefined();
  });

  it('clicking test config posts /api/fleet/nginx/test', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/fleet/nginx/test' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ ok: true, stderr: 'nginx: ok' }) };
      }
      return { ok: true, json: async () => ({ state: baseState }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<NginxManager />);
    });

    await waitFor(() => {
      expect(screen.getByText('Test config')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Test config'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === '/api/fleet/nginx/test' &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
  });
});
