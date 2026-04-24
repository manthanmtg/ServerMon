import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import LogsWidget from './LogsWidget';

const mockLogs = [
  {
    _id: '1',
    moduleId: 'users',
    event: 'User created: admin',
    timestamp: new Date().toISOString(),
    severity: 'info',
  },
  {
    _id: '2',
    moduleId: 'docker',
    event: 'Container started: web',
    timestamp: new Date().toISOString(),
    severity: 'warn',
  },
];

describe('LogsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders loading skeletons initially', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}));
    const { container } = render(<LogsWidget />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders log entries correctly after fetch', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ events: mockLogs }),
    } as Response);

    await act(async () => {
      render(<LogsWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('User created: admin')).toBeTruthy();
      expect(screen.getByText('Container started: web')).toBeTruthy();
    });

    expect(screen.getByText('users')).toBeTruthy();
    expect(screen.getByText('docker')).toBeTruthy();
  });

  it('renders "No activity yet" when no logs are returned', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    } as Response);

    await act(async () => {
      render(<LogsWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('No activity yet')).toBeTruthy();
    });
  });

  it('handles fetch failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(global.fetch).mockRejectedValue(new Error('Fetch failed'));

    await act(async () => {
      render(<LogsWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('No activity yet')).toBeTruthy();
      expect(consoleSpy).toHaveBeenCalled();
    });
    consoleSpy.mockRestore();
  });
});
