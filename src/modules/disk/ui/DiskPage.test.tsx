import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import DiskPage from './DiskPage';
import { ToastProvider } from '@/components/ui/toast';

const mockLatest = {
  timestamp: new Date().toISOString(),
  disks: [
    { fs: '/dev/disk1', type: 'apfs', size: 1000000000, used: 800000000, available: 200000000, use: 80, mount: '/' }
  ],
  io: { r_sec: 1024, w_sec: 2048, t_sec: 3072, r_wait: 0.1, w_wait: 0.2 }
};

vi.mock('@/lib/MetricsContext', () => ({
  useMetrics: () => ({
    latest: mockLatest,
    history: [mockLatest],
    connected: true
  })
}));

vi.mock('@/components/layout/ProShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="pro-shell">{children}</div>
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  };
});

describe('DiskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('health')) return Promise.resolve({ ok: true, json: async () => ({ layout: [{ name: 'SSD', size: 1000000000 }] }) });
      if (url.includes('settings')) return Promise.resolve({ ok: true, json: async () => ({ settings: { unitSystem: 'si' } }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('renders disk usage', async () => {
    await act(async () => {
      render(<ToastProvider><DiskPage /></ToastProvider>);
    });
    await waitFor(() => expect(screen.getAllByText('80.0%').length).toBeGreaterThan(0));
  });

  it('renders filesystem table', async () => {
    await act(async () => {
      render(<ToastProvider><DiskPage /></ToastProvider>);
    });
    await waitFor(() => expect(screen.getByText('/')).toBeDefined());
  });
});
