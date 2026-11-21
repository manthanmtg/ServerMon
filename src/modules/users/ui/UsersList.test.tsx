import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsersList } from './UsersList';
import type { OSUser, WebUser } from './types';

const osUsers: OSUser[] = [
  {
    username: 'root',
    uid: 0,
    home: '/root',
    shell: '/bin/bash',
    groups: ['root', 'sudo'],
    hasSudo: true,
    sshKeysCount: 2,
  },
];

const webUsers: WebUser[] = [
  {
    id: 'web-2',
    username: 'operator',
    role: 'user',
    isActive: false,
    lastLoginAt: undefined,
  },
];

describe('UsersList', () => {
  it('renders OS user table rows with action handlers wired', () => {
    const onDeleteUser = vi.fn();
    const onToggleSudo = vi.fn();

    render(
      <UsersList
        activeTab="os"
        users={osUsers}
        isLoading={false}
        searchQuery=""
        onDeleteUser={onDeleteUser}
        onToggleSudo={onToggleSudo}
        onUpdateRole={vi.fn()}
      />
    );

    const row = within(screen.getByRole('table')).getByText('root').closest('tr');
    expect(row).not.toBeNull();

    const tableRow = within(row!);
    expect(tableRow.getByText('/root')).toBeDefined();
    tableRow.getByTestId('toggle-sudo-btn').click();
    tableRow.getByTestId('delete-user-btn').click();

    expect(onToggleSudo).toHaveBeenCalledWith('root', true);
    expect(onDeleteUser).toHaveBeenCalledWith('os', 'root');
  });

  it('renders web user status and role controls', () => {
    const onUpdateRole = vi.fn();

    render(
      <UsersList
        activeTab="web"
        users={webUsers}
        isLoading={false}
        searchQuery=""
        onDeleteUser={vi.fn()}
        onToggleSudo={vi.fn()}
        onUpdateRole={onUpdateRole}
      />
    );

    const row = within(screen.getByRole('table')).getByText('operator').closest('tr');
    expect(row).not.toBeNull();

    const tableRow = within(row!);
    expect(tableRow.getByText('Disabled')).toBeDefined();
    tableRow.getByRole('button', { name: 'Toggle role for operator' }).click();

    expect(onUpdateRole).toHaveBeenCalledWith('web-2', 'user');
  });
});
