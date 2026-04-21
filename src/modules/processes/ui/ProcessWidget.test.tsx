import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import ProcessWidget from './ProcessWidget';
import { ToastProvider } from '@/components/ui/toast';

const mockProcs = [
  {
    pid: 101,
    parentPid: 1,
    name: 'node',
    command: 'node server.js',
    path: '/usr/bin/node',
    user: 'root',
    state: 'running',
    cpu: 15.5,
    mem: 5.2,
    memRss: 1024 * 1024 * 256,
    started: new Date(Date.now() - 3600000).toISOString(),
    priority: 20,
  },
  {
    pid: 202,
    parentPid: 101,
    name: 'python',
    command: 'python script.py',
    path: '/usr/bin/python',
    user: 'user1',
    state: 'sleeping',
    cpu: 1.2,
    mem: 0.8,
    memRss: 1024 * 1024 * 64,
    started: new Date(Date.now() - 600000).toISOString(),
    priority: 20,
  },
];

const mockSummary = {
  total: 150,
  running: 5,
  sleeping: 140,
  blocked: 5,
  cpuLoad: 25.5,
  memTotal: 16 * 1024 * 1024 * 1024,
  memUsed: 4 * 1024 * 1024 * 1024,
  memPercent: 25.0,
};

describe('ProcessWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ processes: mockProcs, summary: mockSummary }),
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderWidget = async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <ToastProvider>
          <ProcessWidget />
        </ToastProvider>
      );
    });
    return result!;
  };

  it('renders loading state initially', async () => {
    let resolveFetch: (value: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    await act(async () => {
      render(
        <ToastProvider>
          <ProcessWidget />
        </ToastProvider>
      );
    });

    // Check for skeleton
    await waitFor(() => expect(screen.getByTestId('skeleton-card-0')).toBeDefined());

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ processes: mockProcs, summary: mockSummary }),
      } as unknown as Response);
    });

    await waitFor(() => expect(screen.queryByTestId('skeleton-card-0')).toBeNull());
  });

  it('renders process list and summary', async () => {
    await renderWidget();
    await waitFor(() => expect(screen.getByText('150')).toBeDefined());

    expect(screen.getAllByText('node').length).toBeGreaterThan(0);
    expect(screen.getAllByText('python').length).toBeGreaterThan(0);
    expect(screen.getByText('101')).toBeDefined();
    expect(screen.getByText('202')).toBeDefined();

    // Check summary stats
    expect(screen.getByText('25.5%')).toBeDefined();
    expect(screen.getByText('25.0%')).toBeDefined();
  });

  it('filters processes by search', async () => {
    await renderWidget();
    await waitFor(() => expect(screen.getAllByText('node').length).toBeGreaterThan(0));

    const searchInput = screen.getByPlaceholderText(/Search by name/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'node' } });
    });

    // The component refetches after the debounce window elapses.
    await waitFor(() => {
      expect(
        vi.mocked(global.fetch).mock.calls.some(
          ([input]) => typeof input === 'string' && input.includes('search=node')
        )
      ).toBe(true);
    });
  });

  it('sorts processes when clicking headers', async () => {
    await renderWidget();
    await waitFor(() => expect(screen.getAllByText('node').length).toBeGreaterThan(0));

    const cpuHeader = screen.getAllByText('CPU').find((el) => el.closest('th'))!;
    await act(async () => {
      fireEvent.click(cpuHeader);
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('sort=cpu'));

    const memHeader = screen.getAllByText('Memory').find((el) => el.closest('th'))!;
    await act(async () => {
      fireEvent.click(memHeader);
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('sort=mem'));
  });

  it('expands a process to show details', async () => {
    await renderWidget();
    await waitFor(() => expect(screen.getAllByText('node').length).toBeGreaterThan(0));

    // Find the expand button in the desktop table (first button in the row)
    const nodeEls = screen.getAllByText('node');
    const nodeEl = nodeEls.find((el) => el.closest('tr'))!;
    const row = nodeEl.closest('tr')!;
    const expandButton = within(row).getAllByRole('button')[0];

    await act(async () => {
      fireEvent.click(expandButton);
    });

    expect(screen.getAllByText('node server.js').length).toBeGreaterThan(0);
    expect(screen.getAllByText('256.0 MB').length).toBeGreaterThan(0); // RSS Mem
    expect(screen.getAllByText('1').length).toBeGreaterThan(0); // Parent PID
  });

  it('kills a process with SIGTERM', async () => {
    await renderWidget();
    await waitFor(() => expect(screen.getAllByText('node').length).toBeGreaterThan(0));

    // Expand first
    const nodeEls = screen.getAllByText('node');
    const nodeEl = nodeEls.find((el) => el.closest('tr'))!;
    const row = nodeEl.closest('tr')!;
    const expandButton = within(row).getAllByRole('button')[0];
    await act(async () => {
      fireEvent.click(expandButton);
    });

    const killButton = within(row).getByText('Kill');
    await act(async () => {
      fireEvent.click(killButton);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/processes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pid: 101, signal: 'SIGTERM' }),
      })
    );
  });

  it('force kills a process with SIGKILL', async () => {
    await renderWidget();
    await waitFor(() => expect(screen.getAllByText('node').length).toBeGreaterThan(0));

    // Expand
    const nodeEls = screen.getAllByText('node');
    const nodeEl = nodeEls.find((el) => el.closest('tr'))!;
    const row = nodeEl.closest('tr')!;
    const expandButton = within(row).getAllByRole('button')[0];
    await act(async () => {
      fireEvent.click(expandButton);
    });

    const forceKillButton = screen.getAllByText(/Force Kill|SIGKILL/i)[0];
    await act(async () => {
      fireEvent.click(forceKillButton);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/processes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pid: 101, signal: 'SIGKILL' }),
      })
    );
  });

  it('manual refresh works', async () => {
    await renderWidget();
    await waitFor(() => screen.getByText('Refresh'));

    const refreshButton = screen.getByText('Refresh');
    await act(async () => {
      fireEvent.click(refreshButton);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it.skip('polling works', async () => {
    vi.useFakeTimers();
    vi.mocked(global.fetch).mockClear();

    await act(async () => {
      render(
        <ToastProvider>
          <ProcessWidget />
        </ToastProvider>
      );
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    vi.mocked(global.fetch).mockClear();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('handles fetch error gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));
    await renderWidget();
    await waitFor(() => expect(screen.queryByTestId('skeleton-table')).toBeNull());
  });

  it('handles empty results', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ processes: [], summary: mockSummary }),
    });
    await renderWidget();
    await waitFor(() => expect(screen.queryByText('node')).toBeNull());
  });
});
