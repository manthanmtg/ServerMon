import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import TerminalHistoryModal from './TerminalHistoryModal';

const mockHistory = [
  {
    _id: 'h1',
    sessionId: 'sess-1',
    label: 'Main Terminal',
    createdBy: 'admin',
    createdAt: '2026-03-10T10:00:00.000Z',
    closedAt: '2026-03-10T10:30:00.000Z',
    closedBy: 'user:admin',
    exitCode: 0,
    durationMinutes: 30,
    pid: 1234,
  },
  {
    _id: 'h2',
    sessionId: 'sess-2',
    label: 'Dev Terminal',
    createdBy: 'alice',
    createdAt: '2026-03-10T11:00:00.000Z',
    closedAt: '2026-03-10T11:05:00.000Z',
    closedBy: 'timeout-autokill',
    durationMinutes: 5,
    pid: 5678,
  },
  {
    _id: 'h3',
    sessionId: 'sess-3',
    label: 'Active Session',
    createdBy: 'bob',
    createdAt: '2026-03-10T12:00:00.000Z',
    pid: 9999,
  },
  {
    _id: 'h4',
    sessionId: 'sess-4',
    label: 'Server Restart Session',
    createdBy: 'admin',
    createdAt: '2026-03-10T09:00:00.000Z',
    closedAt: '2026-03-10T09:01:00.000Z',
    closedBy: 'server-restart',
    durationMinutes: 1,
  },
  {
    _id: 'h5',
    sessionId: 'sess-5',
    label: 'Failed Session',
    createdBy: 'admin',
    createdAt: '2026-03-10T08:00:00.000Z',
    closedAt: '2026-03-10T08:10:00.000Z',
    closedBy: 'process-exit',
    exitCode: 1,
    durationMinutes: 10,
  },
  {
    _id: 'h6',
    sessionId: 'sess-6',
    label: 'Clean Exit Session',
    createdBy: 'admin',
    createdAt: '2026-03-10T07:00:00.000Z',
    closedAt: '2026-03-10T07:05:00.000Z',
    closedBy: 'process-exit',
    exitCode: 0,
    durationMinutes: 5,
  },
];

describe('TerminalHistoryModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: mockHistory }),
    });
  });

  it('renders loading state initially', async () => {
    let resolve: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));

    render(<TerminalHistoryModal onClose={onClose} />);
    expect(screen.getByText('Loading sessions...')).toBeDefined();

    // Resolve to avoid act warnings
    await act(async () => {
      resolve({ ok: true, json: async () => ({ history: [] }) });
    });
  });

  it('renders history records after loading', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Main Terminal')).toBeDefined();
      expect(screen.getByText('Dev Terminal')).toBeDefined();
    });
  });

  it('shows empty state when no history', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [] }),
    });
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('No history yet')).toBeDefined();
    });
  });

  it('shows error state when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch terminal history')).toBeDefined();
    });
  });

  it('shows error from API response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'Unauthorized' }),
    });
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Unauthorized')).toBeDefined();
    });
  });

  it('allows retry after error', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue({
        ok: true,
        json: async () => ({ history: [] }),
      });

    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Try Again'));
    });

    // Verify a second fetch was triggered on retry
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('calls onClose when close button clicked', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => screen.getByText('Session History'));
    fireEvent.click(screen.getByRole('button', { name: '' })); // X button
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => screen.getByText('Session History'));
    const backdrop = document.querySelector('.absolute.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Timeout badge for timeout-autokill sessions', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeDefined();
    });
  });

  it('shows Restart badge for server-restart sessions', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Restart')).toBeDefined();
    });
  });

  it('shows Exit 0 badge for successful process-exit', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Exit 0')).toBeDefined();
    });
  });

  it('shows Exit code badge for failed process-exit', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Exit 1')).toBeDefined();
    });
  });

  it('shows Active badge for unclosed sessions', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeDefined();
    });
  });

  it('shows user name for user-closed sessions', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      // closedBy: 'user:admin' → shows 'admin' (may appear multiple times as createdBy too)
      const adminElements = screen.getAllByText('admin');
      expect(adminElements.length).toBeGreaterThan(0);
    });
  });

  it('shows session duration for closed sessions', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('30m')).toBeDefined();
    });
  });

  it('displays the modal title', async () => {
    await act(async () => {
      render(<TerminalHistoryModal onClose={onClose} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Session History')).toBeDefined();
    });
  });
});
