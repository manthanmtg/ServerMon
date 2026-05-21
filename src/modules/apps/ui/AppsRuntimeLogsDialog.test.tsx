import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppLogEntry, ManagedAppDTO } from '../types';
import { AppsRuntimeLogsDialog } from './AppsRuntimeLogsDialog';

const app = {
  id: 'app-1',
  name: 'Git Portal',
} as ManagedAppDTO;

describe('AppsRuntimeLogsDialog', () => {
  it('renders runtime log entries with priority and pid details', () => {
    const logs: AppLogEntry[] = [
      {
        timestamp: '2026-05-06T12:00:00.000Z',
        priority: 'info',
        message: 'server started',
        unit: 'servermon-app-git-portal.service',
        pid: 4242,
      },
    ];

    render(
      <AppsRuntimeLogsDialog app={app} logs={logs} loading={false} error={null} onClose={vi.fn()} />
    );

    const dialog = screen.getByRole('dialog', { name: 'Runtime logs' });
    expect(within(dialog).getByText('Git Portal')).toBeTruthy();
    expect(within(dialog).getByText('server started')).toBeTruthy();
    expect(within(dialog).getByText('info')).toBeTruthy();
    expect(within(dialog).getByText('PID 4242')).toBeTruthy();
  });
});
