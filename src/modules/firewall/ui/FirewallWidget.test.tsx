import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import FirewallWidget from './FirewallWidget';
import type { FirewallSnapshot } from '../types';

const defaultSnapshot: FirewallSnapshot = {
  timestamp: '2026-05-16T00:00:00.000Z',
  source: 'live',
  backend: 'ufw',
  available: true,
  enabled: true,
  defaultIncoming: 'deny',
  defaultOutgoing: 'allow',
  defaultRouted: 'disabled',
  rules: [],
  checks: [],
  summary: {
    rulesCount: 8,
    allowCount: 5,
    denyCount: 1,
    rejectCount: 0,
    limitCount: 2,
    ipv6Rules: 2,
    exposedWellKnownCount: 0,
    healthScore: 94,
  },
};

describe('FirewallWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockFetch = (snapshot: Partial<FirewallSnapshot> | null = {}, status = 200) => {
    global.fetch = vi.fn<typeof fetch>(async () => {
      if (status !== 200) {
        throw new Error('Network error');
      }
      return new Response(JSON.stringify({ ...defaultSnapshot, ...snapshot }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    });
  };

  it('renders loading state initially', () => {
    // delay the fetch promise to inspect loading state
    global.fetch = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(JSON.stringify(defaultSnapshot), {
                headers: { 'Content-Type': 'application/json' },
                status: 200,
              }),
            );
          }, 100);
        }),
    );
    render(<FirewallWidget />);
    expect(screen.getByRole('status', { name: 'Loading firewall summary' })).toBeDefined();
  });

  it('renders firewall posture after loading successfully', async () => {
    mockFetch();
    render(<FirewallWidget />);

    await waitFor(() => {
      expect(screen.getByText('Firewall')).toBeDefined();
      expect(screen.getByText('94')).toBeDefined();
      expect(screen.getByText('Active')).toBeDefined();
      expect(screen.getByText('8')).toBeDefined();
      expect(screen.getByText('deny')).toBeDefined();
      expect(screen.getByText('ufw')).toBeDefined();
    });
  });

  it('displays Inactive badge when firewall is available but not enabled', async () => {
    mockFetch({ enabled: false, available: true });
    render(<FirewallWidget />);
    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeDefined();
    });
  });

  it('displays Unavailable badge when firewall is neither available nor enabled', async () => {
    mockFetch({ enabled: false, available: false });
    render(<FirewallWidget />);
    await waitFor(() => {
      expect(screen.getByText('Unavailable')).toBeDefined();
    });
  });

  it('applies text-success class for healthScore >= 85', async () => {
    mockFetch({ summary: { ...defaultSnapshot.summary, healthScore: 90 } });
    render(<FirewallWidget />);
    await waitFor(() => {
      const scoreElement = screen.getByLabelText('Firewall health score 90');
      expect(scoreElement.className).toContain('text-success');
    });
  });

  it('applies text-warning class for healthScore >= 65 and < 85', async () => {
    mockFetch({ summary: { ...defaultSnapshot.summary, healthScore: 70 } });
    render(<FirewallWidget />);
    await waitFor(() => {
      const scoreElement = screen.getByLabelText('Firewall health score 70');
      expect(scoreElement.className).toContain('text-warning');
    });
  });

  it('applies text-destructive class for healthScore < 65', async () => {
    mockFetch({ summary: { ...defaultSnapshot.summary, healthScore: 50 } });
    render(<FirewallWidget />);
    await waitFor(() => {
      const scoreElement = screen.getByLabelText('Firewall health score 50');
      expect(scoreElement.className).toContain('text-destructive');
    });
  });

  it('shows red text for exposed well known ports if count > 0', async () => {
    mockFetch({ summary: { ...defaultSnapshot.summary, exposedWellKnownCount: 3 } });
    render(<FirewallWidget />);
    await waitFor(() => {
      expect(screen.getByText('3').className).toContain('text-destructive');
    });
  });

  it('shows zero exposed ports without destructive class', async () => {
    mockFetch({ summary: { ...defaultSnapshot.summary, exposedWellKnownCount: 0 } });
    render(<FirewallWidget />);
    await waitFor(() => {
      expect(screen.getByText('0').className).not.toContain('text-destructive');
    });
  });

  it('polls for updates every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch();
    render(<FirewallWidget />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('fails gracefully and stops loading state on fetch error', async () => {
    mockFetch({}, 500); // This will trigger the throw error in mockFetch
    render(<FirewallWidget />);
    
    // Default zero state should be shown since there is no snapshot.
    // The widget shouldn't crash.
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull(); // loader should be gone
      expect(screen.getByLabelText('Firewall health score 0')).toBeDefined();
    });
  });
});
