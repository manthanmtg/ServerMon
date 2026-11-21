import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UpdateHistoryModal from './UpdateHistoryModal';
import type { UpdateRunStatus } from '@/types/updates';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeRun(overrides: Partial<UpdateRunStatus> = {}): UpdateRunStatus {
  return {
    runId: 'run-abc-123456',
    status: 'completed',
    timestamp: '2024-01-15T10:00:00.000Z',
    startedAt: '2024-01-15T10:00:00.000Z',
    finishedAt: '2024-01-15T10:05:00.000Z',
    logContent: 'Update completed successfully.',
    exitCode: 0,
    pid: 12345,
    ...overrides,
  };
}

function mockFetchRuns(runs: UpdateRunStatus[]) {
  mockFetch.mockImplementation(async (url: string) => {
    if (url === '/api/system/update/history') {
      return { ok: true, json: async () => runs };
    }
    if (url === '/api/system/update/history?type=agent') {
      return { ok: true, json: async () => runs.filter((run) => run.type === 'agent') };
    }
    const run = runs.find((r) => url.includes(r.runId));
    if (run) {
      return { ok: true, json: async () => run };
    }
    return { ok: false, json: async () => ({}) };
  });
}

describe('UpdateHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
  });

  it('renders the modal with Update History title', async () => {
    mockFetchRuns([]);
    render(<UpdateHistoryModal onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Update History')).toBeDefined();
    });
  });

  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<UpdateHistoryModal onClose={vi.fn()} />);
    expect(screen.getByText('Analyzing History')).toBeDefined();
  });

  it('shows empty state when no runs exist', async () => {
    mockFetchRuns([]);
    render(<UpdateHistoryModal onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('No Records Found')).toBeDefined();
    });
  });

  it('renders a list of update runs', async () => {
    const runs = [
      makeRun({ runId: 'run-aabbccdd1234', status: 'completed', type: 'servermon' }),
      makeRun({ runId: 'run-eeff00112233', status: 'failed', type: 'agent' }),
    ];
    mockFetchRuns(runs);

    render(<UpdateHistoryModal onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('ServerMon App Update')).toBeDefined();
      expect(screen.getByText('ServerMon Agent Update')).toBeDefined();
    });
  });

  it('stacks update run rows on narrow screens before expanding on larger viewports', async () => {
    const run = makeRun({ runId: 'run-mobile-row-test', status: 'completed', type: 'servermon' });
    mockFetchRuns([run]);

    render(<UpdateHistoryModal onClose={vi.fn()} />);

    const title = await screen.findByText('ServerMon App Update');
    const row = title.closest('button');
    const contentGroup = title.closest('.relative.z-10');
    const titleGroup = title.closest('.text-left');

    expect(row?.className).toContain('flex-col');
    expect(row?.className).toContain('sm:flex-row');
    expect(contentGroup?.className).toContain('min-w-0');
    expect(titleGroup?.className).toContain('min-w-0');
  });

  it('requests only agent history when scoped to the agent', async () => {
    const runs = [
      makeRun({ runId: 'run-app', status: 'completed', type: 'servermon' }),
      makeRun({ runId: 'run-agent', status: 'completed', type: 'agent' }),
    ];
    mockFetchRuns(runs);

    render(<UpdateHistoryModal type="agent" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/system/update/history?type=agent');
      expect(screen.getByText('Agent Update History')).toBeDefined();
      expect(screen.getByText('ServerMon Agent Update')).toBeDefined();
      expect(screen.queryByText('ServerMon App Update')).toBeNull();
    });
  });

  it('does not start the elapsed timer when no update is running', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    mockFetchRuns([makeRun({ runId: 'run-completed-only', status: 'completed' })]);

    try {
      render(<UpdateHistoryModal onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('System Update')).toBeDefined();
      });

      const oneSecondTimers = setIntervalSpy.mock.calls.filter(([, delay]) => delay === 1000);
      expect(oneSecondTimers).toHaveLength(0);
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('calls onClose when backdrop is clicked', async () => {
    mockFetchRuns([]);
    const onClose = vi.fn();
    render(<UpdateHistoryModal onClose={onClose} />);
    await waitFor(() => screen.getByText('No Records Found'));

    const backdrop = document.querySelector('.absolute.inset-0');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', async () => {
    mockFetchRuns([]);
    const onClose = vi.fn();
    render(<UpdateHistoryModal onClose={onClose} />);
    await waitFor(() => screen.getByText('No Records Found'));

    // Find close button by its X icon container
    const buttons = document.querySelectorAll('button');
    const closeBtn = Array.from(buttons).find((b) => b.querySelector('svg'));
    if (closeBtn) fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('loads and displays run details when a run is clicked', async () => {
    const run = makeRun({
      runId: 'run-detail-test1',
      logContent: 'Detailed update log output here',
    });
    mockFetchRuns([run]);

    render(<UpdateHistoryModal onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('System Update'));

    fireEvent.click(screen.getByText('System Update').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('Update Log')).toBeDefined();
    });
  });

  it('shows back button in detail view', async () => {
    const run = makeRun({ runId: 'run-back-btn-test' });
    mockFetchRuns([run]);
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/system/update/history') return { ok: true, json: async () => [run] };
      if (url.includes('run-back-btn-test')) return { ok: true, json: async () => run };
      return { ok: false, json: async () => ({}) };
    });

    render(<UpdateHistoryModal onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('System Update'));

    fireEvent.click(screen.getByText('System Update').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('Update Log')).toBeDefined();
    });

    // The back button should exist
    const allButtons = document.querySelectorAll('button');
    expect(allButtons.length).toBeGreaterThan(1);
  });

  it('shows footer with run count', async () => {
    const runs = [makeRun({ runId: 'run-footer-1' }), makeRun({ runId: 'run-footer-2' })];
    mockFetchRuns(runs);

    render(<UpdateHistoryModal onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/Archived Installation Records \(2\)/i)).toBeDefined();
    });
  });

  it('toggles auto-scroll when button clicked in detail view', async () => {
    const run = makeRun({ runId: 'run-autoscroll-test', logContent: 'Log output' });
    mockFetchRuns([run]);
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/system/update/history') return { ok: true, json: async () => [run] };
      if (url.includes('run-autoscroll-test')) return { ok: true, json: async () => run };
      return { ok: false, json: async () => ({}) };
    });

    render(<UpdateHistoryModal onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('System Update'));
    fireEvent.click(screen.getByText('System Update').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText(/Auto-Scroll ON/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Auto-Scroll ON/i));
    await waitFor(() => {
      expect(screen.getByText(/Auto-Scroll OFF/i)).toBeDefined();
    });
  });
});
