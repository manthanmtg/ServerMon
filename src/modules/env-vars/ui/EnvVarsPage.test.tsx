import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EnvVarsPage from './EnvVarsPage';

const toastMock = vi.fn();

vi.mock('@/components/layout/ProShell', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

const snapshot = {
  platform: 'darwin',
  shell: '/bin/zsh',
  target: {
    platform: 'darwin',
    shell: '/bin/zsh',
    home: '/Users/test',
    userFile: '/Users/test/.zshenv',
    writable: true,
    note: 'Open a fresh terminal.',
  },
  persistent: [
    {
      key: 'OPENAI_API_KEY',
      value: 'sk-test',
      scope: 'user',
      source: '/Users/test/.zshenv',
      writable: true,
      sensitive: true,
      inCurrentSession: false,
    },
    {
      key: 'PUBLIC_URL',
      value: 'https://example.com',
      scope: 'user',
      source: '/Users/test/.zshenv',
      writable: true,
      sensitive: false,
      inCurrentSession: true,
    },
  ],
  session: [
    {
      key: 'PATH',
      value: '/usr/bin',
      scope: 'session',
      source: 'env command',
      writable: false,
      sensitive: false,
      inCurrentSession: true,
    },
  ],
  skipped: [],
  systemInstructions: {
    addTemplate: {
      title: 'Add global variable',
      command: 'sudo launchctl setenv EXAMPLE_KEY example-value',
      description: 'Run as admin.',
      requiresAdmin: true,
    },
    deleteTemplate: {
      title: 'Delete global variable',
      command: 'sudo launchctl unsetenv EXAMPLE_KEY',
      description: 'Run as admin.',
      requiresAdmin: true,
    },
  },
  guidance: ['Open a new terminal.'],
  generatedAt: '2026-04-26T00:00:00.000Z',
};

describe('EnvVarsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    } as Response);
  });

  it('loads env command variables first and keeps saved variables available', async () => {
    render(<EnvVarsPage />);

    expect(await screen.findByText('EnvVars')).toBeTruthy();
    expect(screen.getByText('PATH')).toBeTruthy();
    expect(screen.getByText('/Users/test/.zshenv')).toBeTruthy();
    expect(screen.queryByText('OPENAI_API_KEY')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));

    expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy();
    expect(screen.getByText('PUBLIC_URL')).toBeTruthy();
  });

  it('masks secret values and reveals them with the eye button', async () => {
    render(<EnvVarsPage />);

    await screen.findByText('PATH');
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    await screen.findByText('OPENAI_API_KEY');
    expect(screen.queryByText('sk-test')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reveal OPENAI_API_KEY' }));

    expect(screen.getByText('sk-test')).toBeTruthy();
  });

  it('adds a user-scope variable', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ applied: true, message: 'saved' }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot } as Response);

    render(<EnvVarsPage />);
    await screen.findByText('PATH');

    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }));
    const nameInput = await screen.findByLabelText('Name');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'NEW_TOKEN' } });
      fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'secret' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save variable' }));
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/modules/env-vars',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ key: 'NEW_TOKEN', value: 'secret', scope: 'user' }),
      })
    );
  });

  it('deletes a user-scope variable', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ applied: true, message: 'deleted' }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot } as Response);

    render(<EnvVarsPage />);
    await screen.findByText('PATH');
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    await screen.findByText('PUBLIC_URL');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete PUBLIC_URL' }));
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/modules/env-vars',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ key: 'PUBLIC_URL', scope: 'user' }),
      })
    );
  });
});
