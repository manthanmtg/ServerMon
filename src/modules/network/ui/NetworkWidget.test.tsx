import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import NetworkWidget from './NetworkWidget';

const mockNetworkData = {
  stats: [
    { iface: 'eth0', rx_sec: 1024 * 1024, tx_sec: 512 * 1024, rx_bytes: 1000000, tx_bytes: 500000 },
  ],
  connections: [],
  alerts: [],
  source: 'live',
};

describe('NetworkWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockNetworkData,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Download label', async () => {
    await act(async () => {
      render(<NetworkWidget />);
    });
    await waitFor(() => expect(screen.getByText('Download')).toBeDefined());
  });

  it('renders Upload label', async () => {
    await act(async () => {
      render(<NetworkWidget />);
    });
    await waitFor(() => expect(screen.getByText('Upload')).toBeDefined());
  });

  it('shows the interface name', async () => {
    await act(async () => {
      render(<NetworkWidget />);
    });
    await waitFor(() => expect(screen.getByText('eth0')).toBeDefined());
  });

  it('shows network speeds after data loads', async () => {
    await act(async () => {
      render(<NetworkWidget />);
    });
    await waitFor(() => {
      // Should show formatted bytes (multiple elements match - download and upload)
      const speedElements = screen.getAllByText(/MiB\/s|KiB\/s/);
      expect(speedElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows loading placeholders before data loads', async () => {
    let resolveFetch!: (v: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        })
    );
    render(<NetworkWidget />);
    const zeroValues = screen.getAllByText('—/s');
    expect(zeroValues.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      resolveFetch({ ok: true, json: async () => mockNetworkData } as Response);
    });
  });

  it('prefers non-loopback interface', async () => {
    const multiInterfaceData = {
      stats: [
        { iface: 'lo', rx_sec: 0, tx_sec: 0, rx_bytes: 0, tx_bytes: 0 },
        { iface: 'eth0', rx_sec: 2048, tx_sec: 1024, rx_bytes: 100000, tx_bytes: 50000 },
      ],
      connections: [],
      alerts: [],
      source: 'live',
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => multiInterfaceData,
    });
    await act(async () => {
      render(<NetworkWidget />);
    });
    await waitFor(() => expect(screen.getByText('eth0')).toBeDefined());
  });

  it.each([
    {
      name: 'wireless interface containing lo',
      stats: [
        { iface: 'lo', rx_sec: 0, tx_sec: 0, rx_bytes: 0, tx_bytes: 0 },
        { iface: 'wlo1', rx_sec: 4096, tx_sec: 2048, rx_bytes: 100000, tx_bytes: 50000 },
      ],
      expected: 'wlo1',
    },
    {
      name: 'loopback alias before ethernet',
      stats: [
        { iface: 'lo:1', rx_sec: 0, tx_sec: 0, rx_bytes: 0, tx_bytes: 0 },
        { iface: 'eth1', rx_sec: 4096, tx_sec: 2048, rx_bytes: 100000, tx_bytes: 50000 },
      ],
      expected: 'eth1',
    },
    {
      name: 'macOS loopback before wireless',
      stats: [
        { iface: 'lo0', rx_sec: 0, tx_sec: 0, rx_bytes: 0, tx_bytes: 0 },
        { iface: 'en0', rx_sec: 4096, tx_sec: 2048, rx_bytes: 100000, tx_bytes: 50000 },
      ],
      expected: 'en0',
    },
    {
      name: 'loopback-only snapshot',
      stats: [{ iface: 'lo', rx_sec: 512, tx_sec: 256, rx_bytes: 100000, tx_bytes: 50000 }],
      expected: 'lo',
    },
    {
      name: 'ordinary first interface',
      stats: [
        { iface: 'ens18', rx_sec: 4096, tx_sec: 2048, rx_bytes: 100000, tx_bytes: 50000 },
        { iface: 'lo', rx_sec: 0, tx_sec: 0, rx_bytes: 0, tx_bytes: 0 },
      ],
      expected: 'ens18',
    },
  ])('selects the primary interface for $name', async ({ stats, expected }) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stats, connections: [], alerts: [], source: 'live' }),
    });

    await act(async () => {
      render(<NetworkWidget />);
    });

    await waitFor(() => expect(screen.getByText(expected)).toBeDefined());
  });

  it('shows Network label when no data available', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stats: [], connections: [], alerts: [], source: 'live' }),
    });
    await act(async () => {
      render(<NetworkWidget />);
    });
    await waitFor(() => expect(screen.getByText('Network')).toBeDefined());
  });

  it('handles fetch failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<NetworkWidget />);
    });
    await waitFor(() => expect(screen.getByText('Network')).toBeDefined());
  });

  it('does not parse failed HTTP responses', async () => {
    const json = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json,
    });
    await act(async () => {
      render(<NetworkWidget />);
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(json).not.toHaveBeenCalled();
    expect(screen.getByText('Network')).toBeDefined();
  });

  it('passes an abort signal to each poll request', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<NetworkWidget />);
    });

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/modules/network',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    await act(async () => {
      vi.advanceTimersByTime(5001);
    });

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/modules/network',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('polls every 5 seconds', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<NetworkWidget />);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(5001);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
