import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CertificatesPage from './CertificatesPage';

const mockSnapshot = {
  timestamp: new Date().toISOString(),
  source: 'live',
  certbotAvailable: true,
  certbotTimer: {
    enabled: true,
    active: true,
    lastRun: '2026-03-15T12:00:00Z',
    nextRun: '2026-03-17T12:00:00Z',
  },
  certificates: [
    {
      name: 'example.com',
      domains: ['example.com', 'www.example.com'],
      expiryDate: '2026-06-16T09:28:51Z',
      certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
      daysUntilExpiry: 90,
      isExpired: false,
      isExpiringSoon: false,
    },
    {
      name: 'expired.com',
      domains: ['expired.com'],
      expiryDate: '2026-03-10T09:28:51Z',
      certPath: '/etc/letsencrypt/live/expired.com/fullchain.pem',
      daysUntilExpiry: -6,
      isExpired: true,
      isExpiringSoon: false,
    },
  ],
  summary: {
    total: 2,
    valid: 1,
    expiringSoon: 0,
    expired: 1,
    nearestExpiry: -6,
    nearestDomain: 'expired.com',
  },
};

describe('CertificatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/modules/certificates') {
        return Promise.resolve({
          ok: true,
          json: async () => mockSnapshot,
        } as Response);
      }
      return Promise.reject(new Error('URL not mocked'));
    });
  });

  const renderPage = async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<CertificatesPage />);
    });
    return result!;
  };

  it('renders loading state initially', async () => {
    let resolveFetch: (value: Response | PromiseLike<Response>) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { container } = render(<CertificatesPage />);
    expect(container.querySelector('.animate-spin')).toBeDefined();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => mockSnapshot,
      } as Response);
    });

    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
  });

  it('renders summary cards correctly', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Total Certs')).toBeDefined();
      // "Valid" appears in summary card and badge
      expect(screen.getAllByText('Valid').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Expired').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders certificate list with correct status labels', async () => {
    await renderPage();
    await waitFor(() => {
      // example.com appears in name, domains, and path
      expect(screen.getAllByText(/example\.com/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/expired\.com/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Expired 6d ago')).toBeDefined();
    expect(screen.getByText('90d remaining')).toBeDefined();
  });

  it('renders certbot timer info', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Auto-Renewal Timer')).toBeDefined();
      expect(screen.getByText('Active')).toBeDefined();
    });
  });

  it('handles certificate renewal', async () => {
    vi.mocked(global.fetch).mockImplementation((url, options) => {
      if (url === '/api/modules/certificates') {
        return Promise.resolve({ ok: true, json: async () => mockSnapshot } as Response);
      }
      if (url === '/api/modules/certificates/renew' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, output: 'Renewed successfully' }),
        } as Response);
      }
      return Promise.reject(new Error('URL not mocked'));
    });

    await renderPage();
    const renewButtons = screen.getAllByText('Renew');

    await act(async () => {
      fireEvent.click(renewButtons[0]);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/certificates/renew',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ domain: 'example.com' }),
      })
    );

    await waitFor(() => {
      expect(screen.getByText('Renewal successful for example.com')).toBeDefined();
      expect(screen.getByText('Renewed successfully')).toBeDefined();
    });
  });

  it('handles renewal failure', async () => {
    vi.mocked(global.fetch).mockImplementation((url, options) => {
      if (url === '/api/modules/certificates') {
        return Promise.resolve({ ok: true, json: async () => mockSnapshot } as Response);
      }
      if (url === '/api/modules/certificates/renew' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: false, output: 'Renewal failed with error code 1' }),
        } as Response);
      }
      return Promise.reject(new Error('URL not mocked'));
    });

    await renderPage();
    const renewButtons = screen.getAllByText('Renew');

    await act(async () => {
      fireEvent.click(renewButtons[0]);
    });

    await waitFor(() => {
      expect(screen.getByText('Renewal failed for example.com')).toBeDefined();
      expect(screen.getByText('Renewal failed with error code 1')).toBeDefined();
    });
  });
});
