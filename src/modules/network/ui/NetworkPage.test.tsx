import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NetworkPage from './NetworkPage';
import { ToastProvider } from '@/components/ui/toast';

const mockNetworkSnapshot = {
  interfaces: [
    { iface: 'eth0', ip4: '192.168.1.10', operstate: 'up', speed: 1000, mtu: 1500 },
    { iface: 'lo', ip4: '127.0.0.1', operstate: 'up', speed: -1, mtu: 65536 },
  ],
  stats: [
    {
      iface: 'eth0',
      rx_sec: 1024,
      tx_sec: 512,
      rx_packets: 100,
      tx_packets: 50,
      rx_errors: 0,
      tx_errors: 0,
      rx_dropped: 0,
      tx_dropped: 0,
    },
    {
      iface: 'lo',
      rx_sec: 0,
      tx_sec: 0,
      rx_packets: 10,
      tx_packets: 10,
      rx_errors: 0,
      tx_errors: 0,
      rx_dropped: 0,
      tx_dropped: 0,
    },
  ],
  connections: [
    {
      protocol: 'tcp',
      localAddress: '0.0.0.0',
      localPort: 80,
      peerAddress: '0.0.0.0',
      peerPort: 0,
      state: 'LISTEN',
      process: 'nginx',
    },
    {
      protocol: 'tcp',
      localAddress: '192.168.1.10',
      localPort: 443,
      peerAddress: '10.0.0.5',
      peerPort: 54321,
      state: 'ESTABLISHED',
      process: 'nginx',
    },
  ],
  history: [
    { timestamp: new Date().toISOString(), stats: [{ iface: 'eth0', rx_sec: 1024, tx_sec: 512 }] },
  ],
  alerts: [],
};

const mockSpeedtestOverview = {
  running: false,
  settings: {
    scheduleInterval: '1h',
    nextRunAt: '2026-04-26T18:00:00.000Z',
  },
  latest: {
    id: 'speedtest-1',
    trigger: 'manual',
    status: 'completed',
    cli: 'ookla',
    startedAt: '2026-04-26T17:00:00.000Z',
    finishedAt: '2026-04-26T17:01:00.000Z',
    downloadMbps: 94.01,
    uploadMbps: 77.2,
    pingMs: 19.31,
    serverName: 'BHARAT SANCHAR NIGAM LTD',
    serverLocation: 'Coimbatore, India',
    isp: 'BSNL',
    resultUrl: 'https://www.speedtest.net/result/c/example',
  },
  history: [
    {
      id: 'speedtest-1',
      trigger: 'manual',
      status: 'completed',
      cli: 'ookla',
      startedAt: '2026-04-26T17:00:00.000Z',
      finishedAt: '2026-04-26T17:01:00.000Z',
      downloadMbps: 94.01,
      uploadMbps: 77.2,
      pingMs: 19.31,
      serverName: 'BHARAT SANCHAR NIGAM LTD',
    },
  ],
};

vi.mock('@/components/layout/ProShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pro-shell">{children}</div>
  ),
}));

vi.mock('@/modules/terminal/ui/TerminalUI', () => ({
  default: () => <div data-testid="mock-terminal">Terminal Mock</div>,
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

describe('NetworkPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/modules/network/speedtest')) {
        return Promise.resolve({ ok: true, json: async () => mockSpeedtestOverview });
      }
      return Promise.resolve({ ok: true, json: async () => mockNetworkSnapshot });
    });
  });

  const renderPage = async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <ToastProvider>
          <NetworkPage />
        </ToastProvider>
      );
    });
    return result!;
  };

  it('renders network interfaces', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText('eth0')).toBeDefined());
    expect(screen.getByText('192.168.1.10')).toBeDefined();
    await waitFor(() => expect(screen.getAllByText('UP').length).toBeGreaterThan(0));
  });

  it('renders connections', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getAllByText('nginx').length).toBeGreaterThan(0));
  });

  it('renders diagnostics', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText('Network Diagnostics Terminal')).toBeDefined());
    expect(screen.getByText('ip addr')).toBeDefined();
  });

  it('renders speedtest summary and opens history modal', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText('Internet Speedtest')).toBeDefined());
    expect(screen.getByText('94.01 Mbps')).toBeDefined();
    expect(screen.getByText('77.20 Mbps')).toBeDefined();
    expect(screen.getByText('BHARAT SANCHAR NIGAM LTD - Coimbatore, India')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /History/i }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());
    expect(screen.getByText('Speedtest History')).toBeDefined();
  });
});
