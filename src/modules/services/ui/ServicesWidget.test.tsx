import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import ServicesWidget from './ServicesWidget';

const mockSnapshot = {
  services: [],
  alerts: [],
  timers: [],
  history: [],
  source: 'systemd' as const,
  systemdAvailable: true,
  summary: {
    total: 10,
    running: 8,
    exited: 0,
    failed: 1,
    inactive: 1,
    enabled: 8,
    disabled: 2,
    healthScore: 80,
  },
  timestamp: '2026-08-28T00:00:00.000Z',
};

const mockFetchResponse = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('ServicesWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSnapshot,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows skeleton while loading', async () => {
    let resolveFetch!: (v: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        })
    );
    render(<ServicesWidget />);
    expect(screen.queryByText('Services')).toBeNull();
    await act(async () => {
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
    await waitFor(() => expect(screen.getByText('systemd')).toBeDefined());
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

  it('identifies an unavailable service snapshot instead of displaying zero-valued status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    await act(async () => {
      render(<ServicesWidget />);
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load service status');
    expect(alert).toHaveTextContent('Retrying automatically');
    expect(screen.queryByText('Running')).toBeNull();
  });

  it('labels the last verified service snapshot when a refresh fails', async () => {
    vi.useFakeTimers();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockSnapshot } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    const { unmount } = render(<ServicesWidget />);
    await act(async () => {});
    expect(screen.getByText('80')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Showing last service reading');
    expect(screen.getByText('80')).toBeInTheDocument();
    unmount();
  });

  it('treats a malformed successful response as unavailable service data', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse({ error: 'Upstream failed' }));

    render(<ServicesWidget />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load service status');
    expect(screen.queryByText('Running')).toBeNull();
  });

  it('ignores an older failed poll after a newer snapshot succeeds', async () => {
    vi.useFakeTimers();
    const staleResponse = deferred<Response>();
    const freshResponse = deferred<Response>();
    const freshSnapshot = {
      ...mockSnapshot,
      summary: { ...mockSnapshot.summary, healthScore: 95 },
    };
    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => staleResponse.promise)
      .mockImplementationOnce(() => freshResponse.promise);

    const { unmount } = render(<ServicesWidget />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    await act(async () => {
      freshResponse.resolve(mockFetchResponse(freshSnapshot));
    });
    expect(screen.getByText('95')).toBeInTheDocument();

    await act(async () => {
      staleResponse.resolve(mockFetchResponse({ error: 'Stale request failed' }, { status: 503 }));
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('95')).toBeInTheDocument();
    unmount();
  });

  it('clears the stale status after a later verified snapshot succeeds', async () => {
    vi.useFakeTimers();
    const recoveredSnapshot = {
      ...mockSnapshot,
      summary: { ...mockSnapshot.summary, healthScore: 90 },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse(mockSnapshot))
      .mockResolvedValueOnce(mockFetchResponse({ error: 'Temporary failure' }, { status: 503 }))
      .mockResolvedValueOnce(mockFetchResponse(recoveredSnapshot));

    const { unmount } = render(<ServicesWidget />);
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Showing last service reading');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('90')).toBeInTheDocument();
    unmount();
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
