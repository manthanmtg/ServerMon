import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import NginxPage from './NginxPage';

const mockNginxSnapshot = {
  status: {
    running: true,
    pid: 1234,
    version: '1.18.0',
    configPath: '/etc/nginx/nginx.conf',
  },
  summary: {
    totalVhosts: 2,
    sslVhosts: 1,
  },
  connections: {
    active: 10,
    reading: 1,
    writing: 2,
    waiting: 7,
  },
  virtualHosts: [
    {
      name: 'example.com',
      serverNames: ['example.com', 'www.example.com'],
      listenPorts: [80, 443],
      sslEnabled: true,
      enabled: true,
      root: '/var/www/example',
      filename: '/etc/nginx/sites-enabled/example.com',
      raw: 'server { listen 80; ... }',
    },
    {
      name: 'api.example.com',
      serverNames: ['api.example.com'],
      listenPorts: [80],
      sslEnabled: false,
      enabled: false,
      root: '/var/www/api',
      filename: '/etc/nginx/sites-enabled/api.example.com',
    },
  ],
  source: 'live',
};

describe('NginxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => mockNginxSnapshot,
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially', async () => {
    // Mock fetch to delay resolution
    let resolveFetch: (value: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    await act(async () => {
      render(<NginxPage />);
    });

    await waitFor(() => expect(screen.getByTestId('skeleton-card-0')).toBeDefined());

    await act(async () => {
      resolveFetch({ ok: true, json: async () => mockNginxSnapshot } as Response);
    });

    await waitFor(() => expect(screen.queryByTestId('page-skeleton')).toBeNull(), {
      timeout: 5000,
    });
  });

  it('renders status and summary cards', async () => {
    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('Nginx Version'));
    expect(screen.getByText('Running')).toBeDefined();
    expect(screen.getByText('PID: 1234')).toBeDefined();
    expect(screen.getByText('v1.18.0')).toBeDefined();

    // Use more specific selectors for stat cards to avoid matching table headers
    const vhostsLabel = screen
      .getAllByText('Virtual Hosts')
      .find((el) => el.tagName === 'P') as HTMLElement;
    const sslLabel = screen.getByText('SSL Enabled') as HTMLElement;

    expect(
      within(vhostsLabel.closest('div') as HTMLElement).getAllByText('2').length
    ).toBeGreaterThan(0);
    expect(within(sslLabel.closest('div') as HTMLElement).getAllByText('1').length).toBeGreaterThan(
      0
    );
  });

  it('renders live connections', async () => {
    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('Live Connections'));

    const connectionsCard = screen
      .getByText('Live Connections')
      .closest('.rounded-xl') as HTMLElement;
    expect(within(connectionsCard).getAllByText('10').length).toBeGreaterThan(0);
    expect(within(connectionsCard).getAllByText('1').length).toBeGreaterThan(0);
    expect(within(connectionsCard).getAllByText('2').length).toBeGreaterThan(0);
    expect(within(connectionsCard).getAllByText('7').length).toBeGreaterThan(0);
  });

  it('renders virtual hosts list', async () => {
    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getAllByText('Virtual Hosts').length > 1);
    expect(screen.getByText('example.com')).toBeDefined();
    expect(screen.getAllByText('api.example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('example.com, www.example.com')).toBeDefined();
  });

  it('expands virtual host details', async () => {
    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('example.com'));
    fireEvent.click(screen.getByText('example.com'));

    expect(screen.getByText('Listen:')).toBeDefined();
    expect(screen.getByText('80, 443')).toBeDefined();
    expect(screen.getByText('Root:')).toBeDefined();
    expect(screen.getByText('/var/www/example')).toBeDefined();
    expect(screen.getByText('View config')).toBeDefined();
  });

  it('shows config in details', async () => {
    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('example.com'));
    fireEvent.click(screen.getByText('example.com'));

    const summary = screen.getByText('View config');
    expect(summary).toBeDefined();
    expect(screen.getByText('server { listen 80; ... }')).toBeDefined();
  });

  it('performs config test successfully', async () => {
    const testMock = { success: true, output: 'syntax is ok' };
    vi.mocked(global.fetch).mockImplementation((url) => {
      const urlString = url.toString();
      if (urlString === '/api/modules/nginx/test') {
        return Promise.resolve({ ok: true, json: async () => testMock } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockNginxSnapshot,
      } as unknown as Response);
    });

    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('Test Config'));
    fireEvent.click(screen.getByText('Test Config'));

    await waitFor(() => screen.getByText('Config test passed'));
    expect(screen.getByText('syntax is ok')).toBeDefined();
  });

  it('performs reload successfully', async () => {
    const reloadMock = { success: true, output: 'reloaded successfully' };
    vi.mocked(global.fetch).mockImplementation((url) => {
      const urlString = url.toString();
      if (urlString === '/api/modules/nginx/reload') {
        return Promise.resolve({ ok: true, json: async () => reloadMock } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockNginxSnapshot,
      } as unknown as Response);
    });

    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('Reload Nginx'));
    fireEvent.click(screen.getByText('Reload Nginx'));

    await waitFor(() => screen.getByText('reloaded successfully'));
    expect(screen.getByText('reloaded successfully')).toBeDefined();
  });

  it('manual refresh works', async () => {
    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('Refresh'));
    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  describe.skip('Polling', () => {
    it('automatically polls for updates', async () => {
      vi.useFakeTimers();
      await act(async () => {
        render(<NginxPage />);
      });
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      vi.mocked(global.fetch).mockClear();

      await act(async () => {
        vi.advanceTimersByTime(5010);
        vi.runOnlyPendingTimers();
      });

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    });
  });

  it('handles test failure', async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      const urlString = url.toString();
      if (urlString === '/api/modules/nginx/test') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Syntax error on line 10' }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockNginxSnapshot,
      } as unknown as Response);
    });

    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('Test Config'));
    await act(async () => {
      fireEvent.click(screen.getByText('Test Config'));
    });

    await waitFor(() => screen.getByText('Config test failed'));
  });

  it('handles reload failure', async () => {
    vi.mocked(global.fetch).mockImplementation((url) => {
      const urlString = url.toString();
      if (urlString === '/api/modules/nginx/reload') {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Reload failed' }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockNginxSnapshot,
      } as unknown as Response);
    });

    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('Reload Nginx'));
    await act(async () => {
      fireEvent.click(screen.getByText('Reload Nginx'));
    });

    await waitFor(() => expect(screen.getByText(/Reload failed|Request failed/i)).toBeDefined());
  });

  it('renders empty vhosts state', async () => {
    const emptySnapshot = { ...mockNginxSnapshot, virtualHosts: [] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptySnapshot,
    });

    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('No virtual hosts found'));
  });

  it('renders status correctly when stopped', async () => {
    const stoppedSnapshot = {
      ...mockNginxSnapshot,
      status: { ...mockNginxSnapshot.status, running: false, pid: 0 },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => stoppedSnapshot,
    });

    await act(async () => {
      render(<NginxPage />);
    });
    await waitFor(() => screen.getByText('Stopped'));
    expect(
      within(screen.getByText('Stopped').closest('.flex') as HTMLElement).getByText('PID: 0')
    ).toBeDefined();
  });
});
