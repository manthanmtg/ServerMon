import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import DiskWidget from './DiskWidget';
import { useMetrics, SystemMetric } from '@/lib/MetricsContext';

// Mock useMetrics hook
vi.mock('@/lib/MetricsContext', () => ({
  useMetrics: vi.fn(),
}));

const mockMetrics = {
  latest: {
    disks: [
      {
        fs: '/dev/disk3s1s1',
        type: 'apfs',
        size: 1000000000,
        used: 500000000,
        available: 500000000,
        use: 50.0,
        mount: '/',
      },
    ],
    io: {
      r_sec: 1024 * 1024,
      w_sec: 512 * 1024,
      t_sec: 1.5 * 1024 * 1024,
      r_wait: 0.1,
      w_wait: 0.2,
    },
  },
};

describe('DiskWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMetrics).mockReturnValue({
      latest: mockMetrics.latest as unknown as SystemMetric,
      history: [],
      connected: true,
    });
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ settings: { unitSystem: 'binary' } }),
      } as Response)
    );
  });

  it('renders "No data available" when metrics are missing', () => {
    vi.mocked(useMetrics).mockReturnValue({
      latest: null,
      history: [],
      connected: true,
    });
    render(<DiskWidget />);
    expect(screen.getByText('No data available')).toBeTruthy();
  });

  it('renders disk usage and labels correctly', async () => {
    act(() => {
      render(<DiskWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('50.0%')).toBeTruthy();
      expect(screen.getByText('System Usage')).toBeTruthy();
    });
  });

  it('handles different mount points for labels', async () => {
    const macSnapshot = {
      latest: {
        ...mockMetrics.latest,
        disks: [{ ...mockMetrics.latest.disks[0], mount: '/System/Volumes/Data' }],
      },
    };
    vi.mocked(useMetrics).mockReturnValue({
      latest: macSnapshot.latest as unknown as SystemMetric,
      history: [],
      connected: true,
    });

    render(<DiskWidget />);
    await waitFor(() => {
      expect(screen.getByText('Main Disk')).toBeTruthy();
    });
  });

  it('applies danger color for high usage', async () => {
    const highUsageSnapshot = {
      latest: {
        ...mockMetrics.latest,
        disks: [{ ...mockMetrics.latest.disks[0], use: 95.0 }],
      },
    };
    vi.mocked(useMetrics).mockReturnValue({
      latest: highUsageSnapshot.latest as unknown as SystemMetric,
      history: [],
      connected: true,
    });

    const { container } = render(<DiskWidget />);
    await waitFor(() => {
      const progressBar = container.querySelector('.bg-destructive');
      expect(progressBar).toBeTruthy();
    });
  });

  it('applies warning color for moderate-high usage', async () => {
    const warnUsageSnapshot = {
      latest: {
        ...mockMetrics.latest,
        disks: [{ ...mockMetrics.latest.disks[0], use: 80.0 }],
      },
    };
    vi.mocked(useMetrics).mockReturnValue({
      latest: warnUsageSnapshot.latest as unknown as SystemMetric,
      history: [],
      connected: true,
    });

    const { container } = render(<DiskWidget />);
    await waitFor(() => {
      const progressBar = container.querySelector('.bg-orange-500');
      expect(progressBar).toBeTruthy();
    });
  });

  it('handles disk settings fetch failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Settings failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<DiskWidget />);

    await waitFor(() => {
      expect(screen.getByText('50.0%')).toBeTruthy();
    });

    consoleSpy.mockRestore();
  });
});
