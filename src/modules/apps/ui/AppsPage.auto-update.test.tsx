'use client';

import { act, fireEvent, render, screen } from '@testing-library/react';
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

afterEach(() => vi.useRealTimers());

describe('Apps automatic status refresh', () => {
  it('shows detailed automatic status inside the app workspace', async () => {
    global.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ apps: [app], health }),
        }) as Response
    );

    render(<AppsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Scheduled app workspace' }));

    expect(screen.getByRole('region', { name: 'Automatic updates' })).toBeTruthy();
    expect(screen.getByText('Up to date')).toBeTruthy();
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
    expect(screen.getByText('Automatic update scheduler is running')).toBeTruthy();

    failed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Scheduled app workspace' }));
    expect(screen.getByText('Status unavailable')).toBeTruthy();
    expect(screen.queryByText('Automatic update scheduler is running')).toBeNull();
  });
});
