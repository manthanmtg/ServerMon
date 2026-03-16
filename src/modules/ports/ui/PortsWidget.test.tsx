import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import PortsWidget from './PortsWidget';

const mockSnapshot = {
  source: 'live',
  summary: {
    totalListening: 10,
    tcpCount: 8,
    udpCount: 2,
    uniqueProcesses: 5,
  },
  firewall: {
    available: true,
    enabled: true,
    backend: 'ufw',
  },
};

describe('PortsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders loading state initially', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));
    const { container } = render(<PortsWidget />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders port counts correctly', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSnapshot,
    } as Response);

    await act(async () => {
      render(<PortsWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('Listening')).toBeTruthy();
    });

    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('renders firewall status', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockSnapshot,
    } as Response);

    await act(async () => {
      render(<PortsWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Firewall: Active \(ufw\)/i)).toBeTruthy();
    });
  });

  it('handles fetch failure gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Fetch failed'));

    await act(async () => {
      render(<PortsWidget />);
    });

    await waitFor(() => {
      expect(screen.queryByRole('img', { hidden: true })).toBeNull();
    });
  });
});
