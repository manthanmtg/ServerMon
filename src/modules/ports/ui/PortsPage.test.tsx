import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PortsPage, { getFilteredListeningPorts } from './PortsPage';
import type { PortsSnapshot } from '../types';

const mockSnapshot: PortsSnapshot = {
  timestamp: new Date().toISOString(),
  source: 'live',
  listening: [
    {
      protocol: 'tcp',
      port: 80,
      address: '0.0.0.0',
      pid: 1234,
      process: 'nginx',
      user: 'root',
      state: 'LISTEN',
      family: 'IPv4',
    },
    {
      protocol: 'udp',
      port: 53,
      address: '127.0.0.1',
      pid: 567,
      process: 'systemd-resolved',
      user: 'systemd-resolve',
      state: '-',
      family: 'IPv4',
    },
  ],
  summary: {
    totalListening: 2,
    tcpCount: 1,
    udpCount: 1,
    uniqueProcesses: 2,
  },
  firewall: {
    available: true,
    backend: 'ufw',
    enabled: true,
    rules: [
      {
        chain: 'ALLOW',
        action: 'ALLOW',
        protocol: 'tcp',
        port: '22',
        source: 'Any',
        destination: 'Any',
        raw: '22/tcp ALLOW Any',
      },
    ],
  },
};

describe('PortsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/modules/ports') {
        return Promise.resolve({
          ok: true,
          json: async () => mockSnapshot,
        } as Response);
      }
      if (url.includes('/api/modules/ports/check')) {
        const urlObj = new URL(url, 'http://localhost');
        const port = urlObj.searchParams.get('port');
        return Promise.resolve({
          ok: true,
          json: async () => ({
            port: parseInt(port || '0'),
            available: port !== '80',
            process: port === '80' ? 'nginx' : undefined,
          }),
        } as Response);
      }
      return Promise.reject(new Error('URL not mocked'));
    });
  });

  const renderPage = async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<PortsPage />);
    });
    return result!;
  };

  it('renders loading state initially', async () => {
    let resolveFetch: (value: Response | PromiseLike<Response>) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { container } = render(<PortsPage />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => mockSnapshot,
      } as Response);
    });

    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
  });

  it('renders summary cards correctly', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Listening Ports').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('TCP Ports')).toBeTruthy();
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('filters listening ports by search', async () => {
    await renderPage();
    const searchInput = screen.getByPlaceholderText('Search ports...');

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'nginx' } });
    });

    await waitFor(() => {
      expect(screen.getByText('80')).toBeTruthy();
      expect(screen.queryByText('53')).toBeNull();
    });
  });

  it('filters listening ports by protocol', async () => {
    await renderPage();
    const udpButton = screen.getByRole('button', { name: 'UDP' });

    await act(async () => {
      fireEvent.click(udpButton);
    });

    await waitFor(() => {
      expect(screen.getByText('53')).toBeTruthy();
      expect(screen.queryByText('80')).toBeNull();
    });
  });

  it('checks port availability', async () => {
    await renderPage();
    const checkInput = screen.getByPlaceholderText(/Enter port number/i);
    const checkButton = screen.getByRole('button', { name: 'Check' });

    await act(async () => {
      fireEvent.change(checkInput, { target: { value: '80' } });
      fireEvent.click(checkButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Port 80 is in use by nginx/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.change(checkInput, { target: { value: '8080' } });
      fireEvent.click(checkButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Port 8080 is available/i)).toBeTruthy();
    });
  });

  it('renders firewall rules', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Firewall Rules')).toBeTruthy();
      expect(screen.getByText('22')).toBeTruthy();
      expect(screen.getAllByText('ALLOW').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('filters and sorts listening ports without mutating the snapshot', () => {
    const listening: PortsSnapshot['listening'] = [
      { ...mockSnapshot.listening[0], port: 443, process: 'nginx' },
      { ...mockSnapshot.listening[1], port: 53, process: 'systemd-resolved' },
      { ...mockSnapshot.listening[0], port: 80, process: 'caddy' },
    ];

    const filtered = getFilteredListeningPorts(listening, 'tcp', 'http');

    expect(filtered.map((port) => port.port)).toEqual([80, 443]);
    expect(listening.map((port) => port.port)).toEqual([443, 53, 80]);
  });
});
