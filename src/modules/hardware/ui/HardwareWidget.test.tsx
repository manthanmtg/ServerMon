import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import HardwareWidget from './HardwareWidget';

const mockSnapshot = {
  source: 'live',
  uptime: 3600,
  cpu: {
    manufacturer: 'Intel',
    brand: 'Core i9-13900K',
    speed: 3.0,
    cores: 24,
    physicalCores: 24,
    cache: { l3: 32768 },
  },
  memory: {
    total: 32 * 1024 * 1024 * 1024,
    used: 16 * 1024 * 1024 * 1024,
    available: 16 * 1024 * 1024 * 1024,
    swaptotal: 0,
    swapused: 0,
  },
  cpuTemperature: { main: 55, cores: [50, 55, 52], max: 60 },
  disks: [{ device: '/dev/sda', name: 'Samsung SSD', type: 'SSD', size: 1000000000000 }],
  gpus: [],
  usb: [],
  os: {
    hostname: 'server-1',
    platform: 'linux',
    kernel: '6.1',
    arch: 'x64',
    distro: 'Ubuntu',
    release: '22.04',
  },
  system: { manufacturer: 'Custom', model: 'Desktop' },
  bios: { vendor: 'ASUS', version: '1.0', releaseDate: '2023-01-01' },
  baseboard: { manufacturer: 'ASUS', model: 'Z790', memSlots: 4 },
  memoryLayout: [],
};

describe('HardwareWidget', () => {
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
    render(<HardwareWidget />);
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    act(() => {
      resolveFetch({ ok: true, json: async () => mockSnapshot } as Response);
    });
  });

  it('renders Hardware title after load', async () => {
    await act(async () => {
      render(<HardwareWidget />);
    });
    await waitFor(() => expect(screen.getByText('Hardware')).toBeDefined());
  });

  it('shows live badge', async () => {
    await act(async () => {
      render(<HardwareWidget />);
    });
    await waitFor(() => expect(screen.getByText('live')).toBeDefined());
  });

  it('renders CPU brand', async () => {
    await act(async () => {
      render(<HardwareWidget />);
    });
    await waitFor(() => expect(screen.getByText('Core i9-13900K')).toBeDefined());
  });

  it('renders temperature', async () => {
    await act(async () => {
      render(<HardwareWidget />);
    });
    await waitFor(() => expect(screen.getByText('55°C')).toBeDefined());
  });

  it('renders core count', async () => {
    await act(async () => {
      render(<HardwareWidget />);
    });
    await waitFor(() => expect(screen.getByText('24')).toBeDefined());
  });

  it('renders disk count', async () => {
    await act(async () => {
      render(<HardwareWidget />);
    });
    await waitFor(() => expect(screen.getByText('1')).toBeDefined());
  });

  it('shows N/A for zero temperature', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...mockSnapshot,
        cpuTemperature: { main: 0, cores: [], max: 0 },
      }),
    });
    await act(async () => {
      render(<HardwareWidget />);
    });
    await waitFor(() => expect(screen.getByText('N/A')).toBeDefined());
  });

  it('shows warning badge for non-live source', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...mockSnapshot, source: 'cached' }),
    });
    await act(async () => {
      render(<HardwareWidget />);
    });
    await waitFor(() => expect(screen.getByText('cached')).toBeDefined());
  });

  it('handles fetch failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<HardwareWidget />);
    });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('polls every 30 seconds', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<HardwareWidget />);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(30001);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
