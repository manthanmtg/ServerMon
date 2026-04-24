import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import SecurityWidget from './SecurityWidget';

const mockSnapshot = {
  timestamp: new Date().toISOString(),
  source: 'live',
  score: 85,
  checks: [],
  firewall: {
    available: true,
    backend: 'ufw',
    enabled: true,
    defaultIncoming: 'deny',
    defaultOutgoing: 'allow',
    rulesCount: 10,
  },
  fail2ban: {
    available: true,
    running: true,
    jails: [],
    totalBanned: 5,
  },
  ssh: null,
  recentLogins: [],
  users: [],
  pendingUpdates: [],
  summary: {
    totalChecks: 20,
    passed: 17,
    failed: 1,
    warnings: 2,
    criticalIssues: 0,
    bannedIps: 5,
    pendingSecurityUpdates: 0,
  },
};

describe('SecurityWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => mockSnapshot,
      } as Response)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially', async () => {
    let resolveFetch: (value: Response | PromiseLike<Response>) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<SecurityWidget />);
    expect(document.querySelector('.animate-spin')).toBeTruthy();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => mockSnapshot,
      } as Response);
    });

    await waitFor(() => expect(document.querySelector('.animate-spin')).toBeNull());
  });

  it('renders security data correctly', async () => {
    await act(async () => {
      render(<SecurityWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('Security')).toBeTruthy();
      expect(screen.getByText('live')).toBeTruthy();
      expect(screen.getByText('85')).toBeTruthy();
      expect(screen.getByText('17')).toBeTruthy(); // Passed
      expect(screen.getByText('1')).toBeTruthy(); // Failed
      expect(screen.getByText('2')).toBeTruthy(); // Warnings
      expect(screen.getByText('5')).toBeTruthy(); // Banned
    });
  });

  it('handles lower scores with different gauge colors', async () => {
    const lowScoreSnapshot = {
      ...mockSnapshot,
      score: 45,
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => lowScoreSnapshot,
    } as Response);

    await act(async () => {
      render(<SecurityWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('45')).toBeDefined();
    });
  });

  it('polls for data updates', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<SecurityWidget />);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30001);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('handles fetch failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Fetch failed'));

    await act(async () => {
      render(<SecurityWidget />);
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});
