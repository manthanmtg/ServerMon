import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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
    global.fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => mockNetworkSnapshot })
      );
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
});
