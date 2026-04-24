import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { CertificateManager } from './CertificateManager';

describe('CertificateManager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches routes and renders table with tls columns', async () => {
    const routes = [
      {
        _id: 'r1',
        name: 'App',
        domain: 'app.example.com',
        tlsStatus: 'active',
        tlsProvider: 'letsencrypt',
        tlsEnabled: true,
      },
      {
        _id: 'r2',
        name: 'Api',
        domain: 'api.example.com',
        tlsStatus: 'pending',
        tlsEnabled: true,
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes, total: routes.length }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<CertificateManager />);
    });

    await waitFor(() => {
      expect(screen.getByText('app.example.com')).toBeDefined();
    });
    expect(screen.getByText('api.example.com')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/fleet/routes?limit=200');

    // Renew buttons should be disabled in phase 1
    const renewButtons = screen.getAllByText('Renew');
    expect(renewButtons.length).toBe(2);
    for (const b of renewButtons) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('renders empty state when no routes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ routes: [], total: 0 }),
      })
    );

    await act(async () => {
      render(<CertificateManager />);
    });

    await waitFor(() => {
      expect(screen.getByText(/No routes configured yet/)).toBeDefined();
    });
  });
});
