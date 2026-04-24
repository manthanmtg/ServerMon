import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import ServicesWidget from './ServicesWidget';

const mockSnapshot = {
  services: [],
  alerts: [],
  source: 'live',
  systemdAvailable: true,
  summary: {
    total: 10,
    running: 8,
    failed: 1,
    inactive: 1,
    healthScore: 80,
  },
};

describe('ServicesWidget', () => {
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

  it('shows skeleton while loading', () => {
    let resolveFetch!: (v: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        })
    );
    render(<ServicesWidget />);
    expect(screen.queryByText('Services')).toBeNull();
    act(() => {
      resolveFetch({ ok: true, json: async () => mockSnapshot } as Response);
    });
  });

  it('renders Services title after load', async () => {
    await act(async () => {
      render(<ServicesWidget />);
    });
    await waitFor(() => expect(screen.getByText('Services')).toBeDefined());
  });

  it('shows source badge', async () => {
    await act(async () => {
      render(<ServicesWidget />);
    });
    await waitFor(() => expect(screen.getByText('live')).toBeDefined());
  });

  it('renders summary counts', async () => {
    await act(async () => {
      render(<ServicesWidget />);
    });
    await waitFor(() => {
      expect(screen.getByText('Running')).toBeDefined();
      expect(screen.getByText('Failed')).toBeDefined();
      expect(screen.getByText('Inactive')).toBeDefined();
      expect(screen.getByText('Total')).toBeDefined();
    });
  });

  it('renders the health score gauge', async () => {
    await act(async () => {
      render(<ServicesWidget />);
    });
    await waitFor(() => expect(screen.getByText('80')).toBeDefined());
  });

  it('shows alerts section when there are alerts', async () => {
    const snapshotWithAlerts = {
      ...mockSnapshot,
      alerts: [{ id: '1', message: 'Service down', severity: 'critical' }],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshotWithAlerts,
    });

    await act(async () => {
      render(<ServicesWidget />);
    });
    await waitFor(() => expect(screen.getByText('1 active alert')).toBeDefined());
  });

  it('shows plural alerts when multiple alerts', async () => {
    const snapshotWithAlerts = {
      ...mockSnapshot,
      alerts: [
        { id: '1', message: 'Service A down', severity: 'critical' },
        { id: '2', message: 'Service B down', severity: 'warning' },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshotWithAlerts,
    });

    await act(async () => {
      render(<ServicesWidget />);
    });
    await waitFor(() => expect(screen.getByText('2 active alerts')).toBeDefined());
  });

  it('handles fetch failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<ServicesWidget />);
    });
    // Should not crash
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('polls every 10 seconds', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<ServicesWidget />);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(10001);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
