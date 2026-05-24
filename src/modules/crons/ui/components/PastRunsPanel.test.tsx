import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PastRunsPanel } from './PastRunsPanel';
import type { CronRunStatus } from '../../types';

const run: CronRunStatus = {
  runId: 'run-1',
  jobId: 'job-1',
  command: 'node scripts/very-long-cron-command-name-that-should-not-force-page-width.js',
  pid: 1234,
  startedAt: '2026-05-07T03:00:00.000Z',
  finishedAt: '2026-05-07T03:01:00.000Z',
  status: 'completed',
  stdout: 'done',
  stderr: '',
  exitCode: 0,
};

describe('PastRunsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('announces loading while fetching run history', () => {
    global.fetch = vi.fn<typeof fetch>(() => new Promise(() => {}));

    render(<PastRunsPanel onShowOutput={vi.fn()} />);

    expect(screen.getByRole('status', { name: 'Loading run history' })).toBeDefined();
  });

  it('keeps the global history table scrollable on narrow viewports', async () => {
    global.fetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify([run]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    render(<PastRunsPanel onShowOutput={vi.fn()} />);

    const table = await screen.findByRole('table', { name: 'Manual run history' });
    const scroller = table.parentElement;

    expect(scroller).toHaveClass('overflow-x-auto');
    expect(table).toHaveClass('min-w-[520px]');
    expect(within(table).getByText(run.command)).toBeDefined();

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/modules/crons/all/run',
        expect.objectContaining({
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        })
      )
    );
  });

  it('shows an error with retry when run history cannot be loaded', async () => {
    global.fetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 500 })));

    render(<PastRunsPanel onShowOutput={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load run history.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });

  it('shows an error when run history payload is malformed', async () => {
    global.fetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ runs: [run] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    render(<PastRunsPanel onShowOutput={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load run history.');
  });

  it('shows an error when run history contains invalid run rows', async () => {
    global.fetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                ...run,
                status: 'stale',
              },
            ]),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      )
    );

    render(<PastRunsPanel onShowOutput={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load run history.');
  });
});
