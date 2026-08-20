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
    expect(within(dialog).queryByText('Live')).toBeNull();
    expect(within(dialog).queryByText('Follow live output')).toBeNull();
  });

  it('contains keyboard focus and restores it to the opener when closed', () => {
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
    const followOutput = within(dialog).getByLabelText('Autoscroll deployment logs');
    const closeButton = within(dialog).getByRole('button', { name: 'Close deployment logs' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    closeButton.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(followOutput);

    followOutput.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(closeButton);

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
