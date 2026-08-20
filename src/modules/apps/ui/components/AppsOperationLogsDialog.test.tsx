import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppOperation } from '../../types';
import { AppsOperationLogsDialog } from './AppsOperationLogsDialog';

describe('AppsOperationLogsDialog', () => {
  it('shows a truthful empty state for a completed historical operation', () => {
    const operation: AppOperation = {
      id: 'deploy-1',
      type: 'deploy',
      status: 'succeeded',
      title: 'Manual deploy',
      step: 'Deployment completed',
      startedAt: '2026-08-20T03:30:00.000Z',
      completedAt: '2026-08-20T03:35:00.000Z',
      logs: [],
    };

    render(
      <AppsOperationLogsDialog
        appName="Inventory Portal"
        operationType="deploy"
        operation={operation}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Deployment logs' });
    expect(within(dialog).getByText('Succeeded')).toBeTruthy();
    expect(within(dialog).getByText('No logs were captured for this operation.')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Follow live output' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Autoscroll output' })).toBeNull();
  });

  it('provides independent live controls and restores focus when closed', () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    opener.textContent = 'Open logs';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <AppsOperationLogsDialog
        appName="Inventory Portal"
        operationType="deploy"
        operation={{
          id: 'deploy-1',
          type: 'deploy',
          status: 'running',
          title: 'Manual deploy',
          step: 'Building release',
          startedAt: '2026-08-20T03:30:00.000Z',
          logs: ['$ pnpm build'],
        }}
        onClose={onClose}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Deployment logs' });
    const followOutput = within(dialog).getByRole('button', { name: 'Follow live output' });
    const autoscrollOutput = within(dialog).getByRole('button', { name: 'Autoscroll output' });
    const closeButton = within(dialog).getByRole('button', { name: 'Close Deployment logs' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(closeButton).toBeVisible();
    expect(followOutput).toHaveAttribute('aria-pressed', 'true');
    expect(autoscrollOutput).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(followOutput);
    expect(followOutput).toHaveAttribute('aria-pressed', 'false');
    expect(autoscrollOutput).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    const fallback = document.createElement('button');
    fallback.textContent = 'Safe focus target';
    document.body.insertBefore(fallback, opener);
    opener.disabled = true;
    unmount();
    expect(document.activeElement).toBe(fallback);
    fallback.remove();
    opener.remove();
  });
});
