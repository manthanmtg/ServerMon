import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppsPage from './AppsPage';

const app = {
  id: 'app-1',
  name: 'Scheduled app',
  domain: 'app.example.com',
  sourceType: 'git',
  git: {
    url: 'https://example.com/app.git',
    branch: 'main',
    deployedSha: 'abc',
    autoUpdate: {
      enabled: true,
      intervalMinutes: 1440,
      nextRunAt: '2026-09-07T12:00:00Z',
      observedRemoteSha: 'abc',
      lastCheckCompletedAt: '2026-09-06T12:00:00Z',
      lastStatus: 'unchanged',
    },
  },
};
const health = {
  serverTime: '2026-09-06T12:00:00Z',
  worker: { status: 'healthy', lastSeenAt: '2026-09-06T12:00:00Z' },
  scheduler: { status: 'healthy', lastSuccessfulScanAt: '2026-09-06T12:00:00Z' },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Apps automatic status refresh', () => {
  it('stops waiting for logs when an operation has expired', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn(async (input) =>
      String(input).includes('/operations/')
        ? ({
            ok: false,
            status: 404,
            json: async () => ({ error: 'Operation not found' }),
          } as Response)
        : ({
            ok: true,
            json: async () => ({
              apps: [
                {
                  ...app,
                  git: {
                    ...app.git,
                    autoUpdate: { ...app.git.autoUpdate, lastOperationId: 'op_expired' },
                  },
                },
              ],
              health,
            }),
          } as Response)
    );
    await act(async () => {
      render(<AppsPage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'View latest update logs' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText(/Operation history is unavailable or expired/)).toBeTruthy();
    const calls = vi.mocked(global.fetch).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(calls);
  });
  it('opens automatic execution logs linked to the durable operation', async () => {
    const operation = {
      id: 'update-1',
      queueOperationId: 'op_1',
      trigger: 'auto',
      type: 'update',
      status: 'succeeded',
      title: 'Auto update',
      step: 'Update deployed',
      startedAt: '2026-09-06T12:00:00Z',
      logs: ['Built commit abc successfully'],
    };
    global.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            apps: [
              {
                ...app,
                git: { ...app.git, autoUpdate: { ...app.git.autoUpdate, lastOperationId: 'op_1' } },
                operations: [operation],
              },
            ],
            health,
          }),
        }) as Response
    );
    render(<AppsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'View latest update logs' }));
    const dialog = screen.getByRole('dialog', { name: 'Update logs' });
    expect(within(dialog).getByText('Built commit abc successfully')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Update logs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand Scheduled app' }));
    expect(screen.getByText('Automatic')).toBeTruthy();
  });
  it('refreshes idle apps and replaces healthy status when the worker goes offline', async () => {
    vi.useFakeTimers();
    let offline = false;
    global.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            apps: [app],
            health: offline ? { ...health, worker: { status: 'stale' } } : health,
          }),
        }) as Response
    );
    await act(async () => {
      render(<AppsPage />);
    });
    expect(screen.getByText('Automatic update scheduler is running')).toBeTruthy();
    offline = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByText('Automatic updates blocked: Apps worker unavailable')).toBeTruthy();
    expect(screen.queryByText('Up to date')).toBeNull();
  });

  it('marks the existing snapshot unavailable after a refresh fails', async () => {
    vi.useFakeTimers();
    let failed = false;
    global.fetch = vi.fn(
      async () =>
        ({
          ok: !failed,
          json: async () => (failed ? { error: 'Database unavailable' } : { apps: [app], health }),
        }) as Response
    );
    await act(async () => {
      render(<AppsPage />);
    });
    expect(screen.getByText('Up to date')).toBeTruthy();
    failed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByText('Status unavailable')).toBeTruthy();
    expect(screen.queryByText('Automatic update scheduler is running')).toBeNull();
    expect(screen.queryByText('Up to date')).toBeNull();
    failed = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByText('Up to date')).toBeTruthy();
    expect(screen.queryByText('Database unavailable')).toBeNull();
  });
});
