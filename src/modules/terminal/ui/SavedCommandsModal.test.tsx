import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

const mockToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import SavedCommandsModal from './SavedCommandsModal';

const mockCommands = [
  {
    _id: 'cmd1',
    name: 'Restart Nginx',
    command: 'sudo systemctl restart nginx',
    description: 'Restarts the Nginx web server',
    category: 'Nginx',
    createdBy: 'admin',
    createdAt: '2026-03-01T00:00:00.000Z',
  },
  {
    _id: 'cmd2',
    name: 'Check Disk Usage',
    command: 'df -h',
    description: 'Shows disk usage',
    category: 'System',
    createdBy: 'admin',
    createdAt: '2026-03-02T00:00:00.000Z',
  },
  {
    _id: 'cmd3',
    name: 'Docker PS',
    command: 'docker ps -a',
    category: 'Docker',
    createdBy: 'admin',
    createdAt: '2026-03-03T00:00:00.000Z',
  },
];

describe('SavedCommandsModal', () => {
  const onClose = vi.fn();
  const onRunCommand = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commands: mockCommands }),
    });
  });

  it('renders loading state initially', async () => {
    let resolve: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));

    render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    expect(screen.getByText('Loading commands...')).toBeDefined();

    await act(async () => {
      resolve({ ok: true, json: async () => ({ commands: [] }) });
    });
  });

  it('renders modal title', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    expect(screen.getByText('Saved Commands')).toBeDefined();
  });

  it('renders commands after loading', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Restart Nginx')).toBeDefined();
      expect(screen.getByText('Check Disk Usage')).toBeDefined();
      expect(screen.getByText('Docker PS')).toBeDefined();
    });
  });

  it('shows empty state when no commands', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commands: [] }),
    });
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => {
      expect(screen.getByText('No saved commands yet')).toBeDefined();
    });
  });

  it('calls onClose when close button clicked', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Saved Commands'));
    fireEvent.click(screen.getAllByRole('button')[0]); // X button
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Saved Commands'));
    const backdrop = document.querySelector('.absolute.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('filters commands by search term', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Restart Nginx'));

    const searchInput = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(searchInput, { target: { value: 'nginx' } });

    expect(screen.getByText('Restart Nginx')).toBeDefined();
    expect(screen.queryByText('Check Disk Usage')).toBeNull();
    expect(screen.queryByText('Docker PS')).toBeNull();
  });

  it('shows no matching commands message when search has no results', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Restart Nginx'));

    const searchInput = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(searchInput, { target: { value: 'xyz-not-found' } });

    expect(screen.getByText('No matching commands')).toBeDefined();
  });

  it('groups commands by category', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Nginx')).toBeDefined();
      expect(screen.getByText('System')).toBeDefined();
      expect(screen.getByText('Docker')).toBeDefined();
    });
  });

  it('toggles category collapse on click', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Nginx'));

    // Click Nginx category header to collapse
    const nginxCategoryBtn = screen.getAllByRole('button').find(
      (b) => b.textContent?.includes('Nginx')
    );
    expect(nginxCategoryBtn).toBeDefined();
    fireEvent.click(nginxCategoryBtn!);

    // Nginx command should be hidden
    expect(screen.queryByText('Restart Nginx')).toBeNull();
  });

  it('shows add form when Add button clicked', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Saved Commands'));

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(screen.getByText('New Command')).toBeDefined();
  });

  it('hides form when Cancel is clicked in form', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Saved Commands'));

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(screen.getByText('New Command')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('New Command')).toBeNull();
  });

  it('shows warning toast when saving with empty name', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Saved Commands'));

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    // Click Save without filling in fields
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Name and command are required', variant: 'warning' })
    );
  });

  it('saves new command via POST', async () => {
    const createdCommand = {
      _id: 'cmd-new',
      name: 'Test Cmd',
      command: 'echo test',
      category: 'General',
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
    };
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ commands: mockCommands }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ commands: [...mockCommands, createdCommand] }),
      });

    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Saved Commands'));

    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    fireEvent.change(screen.getByPlaceholderText('e.g. Restart Nginx'), {
      target: { value: 'Test Cmd' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. sudo systemctl restart nginx'), {
      target: { value: 'echo test' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/terminal/commands',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('calls onRunCommand with appended newline and closes modal', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Restart Nginx'));

    // Categories are sorted alphabetically: Docker, Nginx, System
    // Click run for the Nginx command (cmd1)
    const runButtons = document.querySelectorAll('[title="Run command"]');
    // Nginx is second category, so its command is at index 1
    fireEvent.click(runButtons[1]);

    expect(onRunCommand).toHaveBeenCalledWith('sudo systemctl restart nginx\n');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows edit form when edit button clicked', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Restart Nginx'));

    // Click edit for Nginx command (second category)
    const editButtons = document.querySelectorAll('[title="Edit command"]');
    fireEvent.click(editButtons[1]); // index 1 = Nginx category command

    expect(screen.getByText('Edit Command')).toBeDefined();
    expect(screen.getByDisplayValue('Restart Nginx')).toBeDefined();
  });

  it('shows delete confirm UI when delete button clicked', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Restart Nginx'));

    const deleteButtons = document.querySelectorAll('[title="Delete command"]');
    fireEvent.click(deleteButtons[0]);

    // Should show confirm/cancel buttons
    expect(document.querySelector('[title="Confirm delete"]')).toBeDefined();
    expect(document.querySelector('[title="Cancel delete"]')).toBeDefined();
  });

  it('cancels delete when cancel button clicked', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Restart Nginx'));

    const deleteButtons = document.querySelectorAll('[title="Delete command"]');
    fireEvent.click(deleteButtons[0]);

    fireEvent.click(document.querySelector('[title="Cancel delete"]') as HTMLElement);
    expect(document.querySelector('[title="Delete command"]')).toBeDefined();
  });

  it('deletes command and updates list', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ commands: mockCommands }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Restart Nginx'));

    // Delete the Docker PS command (index 0, first category alphabetically)
    const deleteButtons = document.querySelectorAll('[title="Delete command"]');
    fireEvent.click(deleteButtons[0]);

    await act(async () => {
      fireEvent.click(document.querySelector('[title="Confirm delete"]') as HTMLElement);
    });

    await waitFor(() => {
      expect(screen.queryByText('Docker PS')).toBeNull();
    });
  });

  it('shows delete error toast on failed delete', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ commands: mockCommands }) })
      .mockResolvedValueOnce({ ok: false });

    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('Restart Nginx'));

    const deleteButtons = document.querySelectorAll('[title="Delete command"]');
    fireEvent.click(deleteButtons[0]);

    await act(async () => {
      fireEvent.click(document.querySelector('[title="Confirm delete"]') as HTMLElement);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Failed to delete command', variant: 'destructive' })
      );
    });
  });

  it('shows save error toast on failed POST', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ commands: [] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Save failed' }) });

    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => screen.getByText('No saved commands yet'));

    // Use search bar area's Add button (only one Add button visible when empty + no form)
    const addButtons = document.querySelectorAll('button');
    const addBtn = Array.from(addButtons).find((b) => b.textContent?.trim().startsWith('Add'));
    fireEvent.click(addBtn!);

    fireEvent.change(screen.getByPlaceholderText('e.g. Restart Nginx'), {
      target: { value: 'My Cmd' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. sudo systemctl restart nginx'), {
      target: { value: 'echo hi' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Save failed', variant: 'destructive' })
      );
    });
  });

  it('shows command count in footer', async () => {
    await act(async () => {
      render(<SavedCommandsModal onClose={onClose} onRunCommand={onRunCommand} />);
    });
    await waitFor(() => {
      expect(screen.getByText('3 commands saved')).toBeDefined();
    });
  });
});
