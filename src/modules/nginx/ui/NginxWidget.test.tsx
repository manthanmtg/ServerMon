import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import NginxWidget from './NginxWidget';

const mockSnapshot = {
  status: { running: true, version: '1.24.0', pid: 1234 },
  summary: { totalVhosts: 5, enabledVhosts: 4, sslVhosts: 3, disabledVhosts: 1 },
  connections: { active: 12, reading: 0, writing: 1, waiting: 11, requests: 50432 },
  vhosts: [],
  alerts: [],
  source: 'live',
};

describe('NginxWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSnapshot,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading spinner initially', () => {
    let resolveFetch!: (v: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        })
    );
    render(<NginxWidget />);
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    act(() => {
      resolveFetch({ ok: true, json: async () => mockSnapshot } as Response);
    });
  });

  it('renders Nginx title after load', async () => {
    await act(async () => {
      render(<NginxWidget />);
    });
    await waitFor(() => expect(screen.getByText('Nginx')).toBeDefined());
  });

  it('shows Running badge when nginx is running', async () => {
    await act(async () => {
      render(<NginxWidget />);
    });
    await waitFor(() => expect(screen.getByText('Running')).toBeDefined());
  });

  it('shows Stopped badge when nginx is not running', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...mockSnapshot, status: { ...mockSnapshot.status, running: false } }),
    });
    await act(async () => {
      render(<NginxWidget />);
    });
    await waitFor(() => expect(screen.getByText('Stopped')).toBeDefined());
  });

  it('renders vhost counts', async () => {
    await act(async () => {
      render(<NginxWidget />);
    });
    await waitFor(() => {
      expect(screen.getByText('V-Hosts')).toBeDefined();
      expect(screen.getByText('Enabled')).toBeDefined();
      expect(screen.getByText('SSL')).toBeDefined();
    });
  });

  it('displays version', async () => {
    await act(async () => {
      render(<NginxWidget />);
    });
    await waitFor(() => expect(screen.getByText('1.24.0')).toBeDefined());
  });

  it('displays connection stats when available', async () => {
    await act(async () => {
      render(<NginxWidget />);
    });
    await waitFor(() => {
      expect(screen.getByText('Active:')).toBeDefined();
      expect(screen.getByText('12')).toBeDefined();
    });
  });

  it('handles fetch failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<NginxWidget />);
    });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('polls every 15 seconds', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<NginxWidget />);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(15001);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
