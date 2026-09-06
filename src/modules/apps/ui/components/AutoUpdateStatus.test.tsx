import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ManagedAppDTO } from '../../types';
import { AutoUpdateStatus } from './AutoUpdateStatus';

const git: NonNullable<ManagedAppDTO['git']> = {
  url: 'https://example.com/app.git',
  branch: 'main',
  autoUpdate: { enabled: true, intervalMinutes: 1440 },
};

describe('AutoUpdateStatus', () => {
  it('shows a pending cancellation while the operation still owns the app', () => {
    render(
      <AutoUpdateStatus
        git={{ ...git, autoUpdate: { ...git.autoUpdate, operationStatus: 'cancel_requested' } }}
      />
    );
    expect(screen.getByText('Cancelling')).toBeTruthy();
    expect(screen.queryByText('Scheduled')).toBeNull();
  });
  it.each([
    ['source', 'Checking'],
    ['build', 'Deploying'],
    ['health', 'Deploying'],
  ] as const)('shows %s phase as %s', (operationPhase, label) => {
    render(
      <AutoUpdateStatus
        git={{
          ...git,
          autoUpdate: { ...git.autoUpdate, operationStatus: 'running', operationPhase },
        }}
      />
    );
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('opens logs for the recorded operation', () => {
    const open = vi.fn();
    render(
      <AutoUpdateStatus
        git={{ ...git, autoUpdate: { ...git.autoUpdate, lastOperationId: 'op_123' } }}
        onOpenLogs={open}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'View latest update logs' }));
    expect(open).toHaveBeenCalledWith('op_123');
  });

  it('shows the latest failed outcome even when another attempt is overdue', () => {
    render(
      <AutoUpdateStatus
        git={{
          ...git,
          autoUpdate: {
            ...git.autoUpdate,
            lastStatus: 'failed',
            nextRunAt: '2026-09-06T12:00:00Z',
          },
        }}
        now={new Date('2026-09-06T12:03:00Z')}
      />
    );
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it.each(['worker_unavailable', 'scheduler_stale'] as const)(
    'shows explicit %s block without a health snapshot',
    (blockReason) => {
      render(<AutoUpdateStatus git={{ ...git, autoUpdate: { ...git.autoUpdate, blockReason } }} />);
      expect(screen.getByText('Blocked')).toBeTruthy();
    }
  );
  it('explains an overdue check that has never started', () => {
    render(
      <AutoUpdateStatus
        git={{ ...git, autoUpdate: { ...git.autoUpdate, nextRunAt: '2026-09-06T12:00:00Z' } }}
        now={new Date('2026-09-06T12:03:00Z')}
      />
    );
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText(/No attempt has started/)).toBeTruthy();
    expect(screen.queryByText('Up to date')).toBeNull();
  });

  it('never treats the checkout SHA as a successfully deployed commit', () => {
    render(
      <AutoUpdateStatus
        git={{
          ...git,
          currentSha: 'abc123456',
          autoUpdate: { ...git.autoUpdate, lastStatus: 'unchanged' },
        }}
      />
    );
    expect(screen.getByText('Deployed version unknown')).toBeTruthy();
    expect(screen.queryByText('Up to date')).toBeNull();
  });

  it('keeps the failed deployment visible during retry backoff', () => {
    render(
      <AutoUpdateStatus
        git={{
          ...git,
          deployedSha: 'old123456',
          autoUpdate: {
            ...git.autoUpdate,
            lastStatus: 'failed',
            lastError: 'Build failed',
            retryAt: '2026-09-06T12:05:00Z',
          },
        }}
        now={new Date('2026-09-06T12:03:00Z')}
      />
    );
    expect(screen.getByText('Retry scheduled')).toBeTruthy();
    expect(screen.getByText('Build failed')).toBeTruthy();
    expect(screen.getByText('old1234')).toBeTruthy();
  });

  it('distinguishes queued work from an actual Git attempt', () => {
    render(
      <AutoUpdateStatus
        git={{ ...git, autoUpdate: { ...git.autoUpdate, operationStatus: 'queued' } }}
      />
    );
    expect(screen.getByText('Queued')).toBeTruthy();
    expect(screen.getByText('Not attempted yet')).toBeTruthy();
  });

  it('explains rollback pause', () => {
    render(
      <AutoUpdateStatus
        git={{ ...git, autoUpdate: { ...git.autoUpdate, enabled: false, pauseReason: 'rollback' } }}
      />
    );
    expect(screen.getByText('Paused after rollback')).toBeTruthy();
    expect(screen.getByText(/Enable auto-update to resume/)).toBeTruthy();
  });

  it('does not keep a healthy state after snapshot refresh fails', () => {
    render(
      <AutoUpdateStatus
        git={{
          ...git,
          deployedSha: 'abc',
          autoUpdate: { ...git.autoUpdate, observedRemoteSha: 'abc', lastStatus: 'unchanged' },
        }}
        snapshotUnavailable
      />
    );
    expect(screen.getByText('Status unavailable')).toBeTruthy();
    expect(screen.queryByText('Up to date')).toBeNull();
  });
});
