import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import AIAgentsWidget from './AIAgentsWidget';

const mockSnapshot = {
  sessions: [
    {
      id: 'sess-1',
      status: 'running',
      agent: { displayName: 'Claude Code', type: 'claude-code' },
      environment: { repository: 'my-repo', cwd: '/home/user' },
      startedAt: new Date().toISOString(),
    },
    {
      id: 'sess-2',
      status: 'idle',
      agent: { displayName: 'Codex', type: 'codex' },
      environment: { repository: '', cwd: '/home/user' },
      startedAt: new Date().toISOString(),
    },
  ],
  summary: { running: 1, idle: 1, error: 0, waiting: 0, total: 2 },
};

describe('AIAgentsWidget', () => {
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

  it('shows skeleton while loading', () => {
    let resolveFetch!: (v: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((r) => { resolveFetch = r; })
    );
    render(<AIAgentsWidget />);
    // Skeleton is shown – no session list yet
    expect(screen.queryByText('AI Agents')).toBeNull();
    act(() => {
      resolveFetch({ ok: true, json: async () => mockSnapshot } as Response);
    });
  });

  it('renders AI Agents title after load', async () => {
    await act(async () => {
      render(<AIAgentsWidget />);
    });
    await waitFor(() => expect(screen.getByText('AI Agents')).toBeDefined());
  });

  it('renders summary counts', async () => {
    await act(async () => {
      render(<AIAgentsWidget />);
    });
    await waitFor(() => {
      expect(screen.getByText('Running')).toBeDefined();
      expect(screen.getByText('Idle')).toBeDefined();
      expect(screen.getByText('Error')).toBeDefined();
      expect(screen.getByText('Total')).toBeDefined();
    });
  });

  it('renders session list when sessions exist', async () => {
    await act(async () => {
      render(<AIAgentsWidget />);
    });
    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeDefined();
      expect(screen.getByText('my-repo')).toBeDefined();
    });
  });

  it('shows active badge when sessions exist', async () => {
    await act(async () => {
      render(<AIAgentsWidget />);
    });
    await waitFor(() => expect(screen.getByText('active')).toBeDefined());
  });

  it('shows none badge when no sessions', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [], summary: { running: 0, idle: 0, error: 0, waiting: 0, total: 0 } }),
    });
    await act(async () => {
      render(<AIAgentsWidget />);
    });
    await waitFor(() => expect(screen.getByText('none')).toBeDefined());
  });

  it('shows empty state when no sessions', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [], summary: { running: 0, idle: 0, error: 0, waiting: 0, total: 0 } }),
    });
    await act(async () => {
      render(<AIAgentsWidget />);
    });
    await waitFor(() => expect(screen.getByText('No active AI agent sessions detected')).toBeDefined());
  });

  it('shows +N more when more than 3 sessions', async () => {
    const manySessions = Array.from({ length: 5 }, (_, i) => ({
      id: `sess-${i}`,
      status: 'running',
      agent: { displayName: `Agent ${i}`, type: 'claude-code' },
      environment: { repository: '', cwd: '/home/user' },
      startedAt: new Date().toISOString(),
    }));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: manySessions, summary: { running: 5, idle: 0, error: 0, waiting: 0, total: 5 } }),
    });
    await act(async () => {
      render(<AIAgentsWidget />);
    });
    await waitFor(() => expect(screen.getByText('+2 more sessions')).toBeDefined());
  });

  it('handles fetch failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<AIAgentsWidget />);
    });
    await waitFor(() => expect(screen.queryByText('AI Agents')).toBeDefined());
  });

  it('polls for updates every 10 seconds', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<AIAgentsWidget />);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(10001);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
