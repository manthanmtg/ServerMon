import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import UsersPage from './UsersPage';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('@/components/layout/ProShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pro-shell">{children}</div>
  ),
}));

const mockOSUsers = [
  {
    username: 'root',
    uid: 0,
    home: '/root',
    shell: '/bin/bash',
    groups: ['root', 'sudo'],
    hasSudo: true,
    sshKeysCount: 2,
  },
  {
    username: 'user1',
    uid: 1001,
    home: '/home/user1',
    shell: '/bin/zsh',
    groups: ['user1'],
    hasSudo: false,
    sshKeysCount: 1,
  },
];

const mockWebUsers = [
  {
    id: 'web-1',
    username: 'admin',
    role: 'admin',
    isActive: true,
    lastLoginAt: new Date().toISOString(),
  },
  {
    id: 'web-2',
    username: 'operator',
    role: 'user',
    isActive: false,
    lastLoginAt: null,
  },
];

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('type=os')) {
        return Promise.resolve({ ok: true, json: async () => mockOSUsers });
      }
      if (url.includes('type=web')) {
        return Promise.resolve({ ok: true, json: async () => mockWebUsers });
      }
      return Promise.resolve({ ok: true, json: async () => ({ status: 'ok' }) });
    });

    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  const renderPage = async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <ToastProvider>
          <UsersPage />
        </ToastProvider>
      );
    });
    return result!;
  };

  it('renders loading state initially', async () => {
    let resolveOS: (value: Response) => void;
    vi.mocked(global.fetch).mockImplementation((url) => {
      const urlString = url.toString();
      if (urlString.includes('type=os')) {
        return new Promise<Response>((resolve) => {
          resolveOS = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] } as unknown as Response);
    });

    await act(async () => {
      render(
        <ToastProvider>
          <UsersPage />
        </ToastProvider>
      );
    });

    expect(screen.getByText(/Scanning identity records/i)).toBeDefined();

    await act(async () => {
      resolveOS!({ ok: true, json: async () => mockOSUsers } as unknown as Response);
    });

    await waitFor(() => expect(screen.queryByText(/Scanning identity records/i)).toBeNull());
  });

  it('renders OS users by default', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('root'));
    expect(screen.getByText('user1')).toBeDefined();
    expect(screen.getByText('UID: 0')).toBeDefined();
    expect(screen.getByText('/bin/bash')).toBeDefined();
  });

  it('switches to Web Access tab', async () => {
    await renderPage();
    const webTab = screen.getByText('Web Access');
    await act(async () => {
      fireEvent.click(webTab);
    });

    await waitFor(() => expect(screen.getByText('operator')).toBeDefined());
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('Disabled')).toBeDefined();
  });

  it('filters users by search', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('root'));

    const searchInput = screen.getByPlaceholderText('Search users...');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'user1' } });
    });

    expect(screen.getByText('user1')).toBeDefined();
    expect(screen.queryByText('root')).toBeNull();
  });

  it('toggles sudo privilege for OS user', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('user1'));

    const row = screen.getByText('root').closest('tr')!;
    const sudoButton = within(row).getByTestId('toggle-sudo-btn');

    await act(async () => {
      fireEvent.click(sudoButton);
    });

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      '/api/modules/users',
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });

  it('updates role for web user', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByText('Web Access'));
    });
    await waitFor(() => screen.getByText('operator'));

    const row = screen.getByText('operator').closest('tr')!;
    const roleButton = within(row).getByText('user');

    await act(async () => {
      fireEvent.click(roleButton);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/users',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ type: 'web', id: 'web-2', role: 'admin' }),
      })
    );
  });

  it('deletes an OS user with confirmation', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('user1'));

    const row = screen.getByText('user1').closest('tr')!;
    const deleteButton = within(row).getByTestId('delete-user-btn');

    await act(async () => {
      fireEvent.click(deleteButton);
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('username=user1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('shows add user modal', async () => {
    await renderPage();
    const addButton = screen.getByText(/Add User/i);
    await act(async () => {
      fireEvent.click(addButton);
    });

    expect(screen.getByText('Add OS User')).toBeDefined();
  });

  it('handles fetch errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('API Failure'));
    await renderPage();
    await waitFor(() => expect(screen.queryByText(/Scanning identity records/i)).toBeNull());
    // Should show error toast (implicitly handled by mockFetch)
  });
});
