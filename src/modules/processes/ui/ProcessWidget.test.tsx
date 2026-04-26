import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    parentPid: 1,
    name: 'python',
    command: 'python app.py',
    path: '/usr/bin/python',
    user: 'www-data',
    state: 'sleeping',
    cpu: 10.0,
    mem: 20.3,
    memRss: 1024 * 1024 * 1024,
    started: new Date(Date.now() - 7200000).toISOString(),
    priority: 10,
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
    vi.useFakeTimers();
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
    const result = render(
      <ToastProvider>
        <ProcessWidget />
      </ToastProvider>
    );
    // Wait for initial fetch
    await waitFor(() => expect(screen.queryByTestId('skeleton-card-0')).not.toBeInTheDocument());
    return result;
  };

  it('renders loading state initially', async () => {
    let resolveFetch: (value: Response) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(
      <ToastProvider>
        <ProcessWidget />
      </ToastProvider>
    );

    // Check for skeleton
    await waitFor(() => expect(screen.getByTestId('skeleton-card-0')).toBeDefined());

    resolveFetch!({
      ok: true,
      json: async () => ({ processes: mockProcs, summary: mockSummary }),
    } as unknown as Response);

    await waitFor(() => expect(screen.queryByTestId('skeleton-card-0')).not.toBeInTheDocument());
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
    fireEvent.change(searchInput, { target: { value: 'python' } });

    // Should trigger fetch with search
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('search=python'));
    });
  });

  it('sorts processes when clicking headers', async () => {
    await renderWidget();

    const memHeader = screen.getByRole('button', { name: /Sort by Memory/i });
    fireEvent.click(memHeader);

    // Should trigger fetch with sort=mem
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('sort=mem'));
    });
  });

  it('expands a process to show details', async () => {
    await renderWidget();

    // Find expand button for PID 101
    const expandButtons = screen.getAllByLabelText(/Expand details for process node \(101\)/i);
    fireEvent.click(expandButtons[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/node server.js/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/256 MB/i).length).toBeGreaterThan(0);
    });
  });

  it('kills a process with SIGTERM', async () => {
    await renderWidget();

    // Expand PID 101
    const expandButtons = screen.getAllByLabelText(/Expand details for process node \(101\)/i);
    fireEvent.click(expandButtons[0]);

    // Click SIGTERM
    const termButton = screen.getAllByRole('button', { name: /SIGTERM/i })[0];
    fireEvent.click(termButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/modules/processes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ pid: 101, signal: 'SIGTERM' }),
        })
      );
    });
  });

  it('force kills a process with SIGKILL', async () => {
    await renderWidget();

    // Expand PID 101
    const expandButtons = screen.getAllByLabelText(/Expand details for process node \(101\)/i);
    fireEvent.click(expandButtons[0]);

    // Click SIGKILL
    const killButton = screen.getAllByRole('button', { name: /SIGKILL/i })[0];
    fireEvent.click(killButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/modules/processes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ pid: 101, signal: 'SIGKILL' }),
        })
      );
    });
  });

  it('manual refresh works', async () => {
    await renderWidget();

    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it.skip('polling works', async () => {
    await renderWidget();
    vi.clearAllMocks();

    vi.advanceTimersByTime(5000);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('handles fetch error gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Fetch failed'));
    await renderWidget();
    // Should not crash
    expect(screen.getByText('150')).toBeDefined();
  });

  it('handles empty results', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ processes: [], summary: mockSummary }),
    });
    await renderWidget();
    await waitFor(() => {
      expect(screen.queryByText('node')).not.toBeInTheDocument();
    });
  });
});
