import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SettingsPage from './page';

// ---- Mocks ----

vi.mock('@/components/layout/ProShell', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="pro-shell">
      <span data-testid="title">{title}</span>
      {children}
    </div>
  ),
}));

const mockSetTheme = vi.fn();
vi.mock('@/lib/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      id: 'dark',
      name: 'Dark',
      type: 'dark',
      colors: {
        primary: '#6366f1',
        secondary: '#4f46e5',
        accent: '#818cf8',
        background: '#0f172a',
        border: '#1e293b',
      },
    },
    setTheme: mockSetTheme,
    availableThemes: [
      {
        id: 'dark',
        name: 'Dark',
        type: 'dark',
        colors: {
          primary: '#6366f1',
          secondary: '#4f46e5',
          accent: '#818cf8',
          background: '#0f172a',
          border: '#1e293b',
        },
      },
      {
        id: 'light',
        name: 'Light',
        type: 'light',
        colors: {
          primary: '#4f46e5',
          secondary: '#6366f1',
          accent: '#818cf8',
          background: '#ffffff',
          border: '#e2e8f0',
        },
      },
    ],
  }),
}));

const mockUpdateSettings = vi.fn();
vi.mock('@/lib/BrandContext', () => ({
  useBrand: () => ({
    settings: { pageTitle: 'ServerMon', logoBase64: '' },
    updateSettings: mockUpdateSettings,
  }),
}));

const mockToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/modules/security/ui/PasskeySettings', () => ({
  default: () => <div data-testid="passkey-settings">PasskeySettings</div>,
}));

vi.mock('@/components/settings/UpdateHistoryModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="update-history-modal">
      <button onClick={onClose}>Close History</button>
    </div>
  ),
}));

vi.mock('@/components/settings/QuickAccessSettings', () => ({
  default: () => <div data-testid="quick-access-settings">QuickAccessSettings</div>,
}));

vi.mock('@/components/ui/ConfirmationModal', () => ({
  default: ({
    isOpen,
    onConfirm,
    onCancel,
    title,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
  }) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ modules: [] }),
    });
  });

  it('renders within ProShell with correct title', async () => {
    await act(async () => render(<SettingsPage />));
    expect(screen.getByTestId('title').textContent).toBe('Settings');
  });

  it('renders the Appearance section', async () => {
    await act(async () => render(<SettingsPage />));
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('Choose a theme for the interface')).toBeDefined();
  });

  it('renders available themes', async () => {
    await act(async () => render(<SettingsPage />));
    expect(screen.getByText('Dark')).toBeDefined();
    expect(screen.getByText('Light')).toBeDefined();
  });

  it('calls setTheme when a theme is clicked', async () => {
    await act(async () => render(<SettingsPage />));

    const lightThemeButton = screen.getByText('Light').closest('button');
    expect(lightThemeButton).not.toBeNull();
    fireEvent.click(lightThemeButton!);

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('renders the Modules section', async () => {
    await act(async () => render(<SettingsPage />));
    expect(screen.getByText('Modules')).toBeDefined();
  });

  it('shows "No modules installed" when modules list is empty', async () => {
    await act(async () => render(<SettingsPage />));
    await waitFor(() => {
      expect(screen.getByText('No modules installed')).toBeDefined();
    });
  });

  it('renders modules fetched from API', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: [
          { id: 'metrics', name: 'Metrics', description: 'System metrics' },
          { id: 'terminal', name: 'Terminal' },
        ],
      }),
    });

    await act(async () => render(<SettingsPage />));

    await waitFor(() => {
      expect(screen.getByText('Metrics')).toBeDefined();
      expect(screen.getByText('Terminal')).toBeDefined();
    });
  });

  it('uses module id as fallback description when description is absent', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        modules: [{ id: 'terminal', name: 'Terminal' }],
      }),
    });

    await act(async () => render(<SettingsPage />));

    await waitFor(() => {
      expect(screen.getByText('terminal module')).toBeDefined();
    });
  });

  it('renders the Security section with expected values', async () => {
    await act(async () => render(<SettingsPage />));
    expect(screen.getByText('Argon2id')).toBeDefined();
    expect(screen.getByText('2 hours')).toBeDefined();
  });

  it('renders PasskeySettings component', async () => {
    await act(async () => render(<SettingsPage />));
    expect(screen.getByTestId('passkey-settings')).toBeDefined();
  });

  it('renders QuickAccessSettings component', async () => {
    await act(async () => render(<SettingsPage />));
    expect(screen.getByTestId('quick-access-settings')).toBeDefined();
  });

  it('renders Branding section with page title input', async () => {
    await act(async () => render(<SettingsPage />));
    expect(screen.getByText('Branding')).toBeDefined();
    const titleInput = screen.getByPlaceholderText('e.g. MyServer') as HTMLInputElement;
    expect(titleInput.value).toBe('ServerMon');
  });

  it('saves branding changes on button click', async () => {
    mockUpdateSettings.mockResolvedValue(undefined);

    await act(async () => render(<SettingsPage />));

    // Click Save with the existing title (no change needed to verify the call path)
    await act(async () => {
      fireEvent.click(screen.getByText('Save Branding Changes'));
    });

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ logoBase64: '' }));
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Branding Updated', variant: 'success' })
    );
  });

  it('shows error toast when saving branding fails', async () => {
    mockUpdateSettings.mockRejectedValue(new Error('Network error'));

    await act(async () => render(<SettingsPage />));

    await act(async () => {
      fireEvent.click(screen.getByText('Save Branding Changes'));
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error', variant: 'destructive' })
      );
    });
  });

  it('opens update history modal when history button is clicked', async () => {
    await act(async () => render(<SettingsPage />));

    const historyButton = screen.getByTitle('View update history');
    await act(async () => {
      fireEvent.click(historyButton);
    });

    expect(screen.getByTestId('update-history-modal')).toBeDefined();
  });

  it('closes update history modal', async () => {
    await act(async () => render(<SettingsPage />));

    fireEvent.click(screen.getByTitle('View update history'));
    await waitFor(() => expect(screen.getByTestId('update-history-modal')).toBeDefined());

    fireEvent.click(screen.getByText('Close History'));
    await waitFor(() => expect(screen.queryByTestId('update-history-modal')).toBeNull());
  });

  it('shows confirmation modal when ServerMon update button is clicked', async () => {
    await act(async () => render(<SettingsPage />));

    const updateButton = screen.getByText('Update ServerMon');
    await act(async () => {
      fireEvent.click(updateButton);
    });

    expect(screen.getByTestId('confirmation-modal')).toBeDefined();
    expect(screen.getByText('Update ServerMon App')).toBeDefined();
  });

  it('cancels ServerMon update from confirmation modal', async () => {
    await act(async () => render(<SettingsPage />));

    fireEvent.click(screen.getByText('Update ServerMon'));
    await waitFor(() => expect(screen.getByTestId('confirmation-modal')).toBeDefined());

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByTestId('confirmation-modal')).toBeNull());
  });

  it('triggers ServerMon update when confirmed', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (url: string, opts?: RequestInit) => {
        if (url === '/api/modules/updates/run' && opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, pid: 12345, runId: 'servermon-run' }),
          });
        }

        if (url === '/api/modules/updates/agent') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ agent: null }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ modules: [] }),
        });
      }
    );

    await act(async () => render(<SettingsPage />));

    fireEvent.click(screen.getByText('Update ServerMon'));
    await waitFor(() => expect(screen.getByTestId('confirmation-modal')).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/updates/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'servermon' }),
      })
    );
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'ServerMon update started', variant: 'success' })
      );
    });
  });

  it('shows error toast when ServerMon update fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (url: string, opts?: RequestInit) => {
        if (url === '/api/modules/updates/run' && opts?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: 'Permission denied' }),
          });
        }

        if (url === '/api/modules/updates/agent') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ agent: null }),
          });
        }

        return Promise.resolve({
          ok: false,
          json: async () => ({ modules: [] }),
        });
      }
    );

    await act(async () => render(<SettingsPage />));

    fireEvent.click(screen.getByText('Update ServerMon'));
    await waitFor(() => expect(screen.getByTestId('confirmation-modal')).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'));
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Update failed', variant: 'destructive' })
      );
    });
  });

  it('renders About section with version info', async () => {
    await act(async () => render(<SettingsPage />));
    expect(screen.getByText('Version')).toBeDefined();
    expect(screen.getByText('1.0.0')).toBeDefined();
    expect(screen.getByText('Next.js')).toBeDefined();
    expect(screen.getByText('MongoDB')).toBeDefined();
  });

  it('renders ServerMon service controls in settings', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/api/modules/updates/agent') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            agent: {
              serviceName: 'servermon-agent.service',
              installed: true,
              active: true,
              enabled: true,
              repoDir: '/opt/servermon-agent/source',
              updateSupported: true,
            },
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ modules: [] }),
      });
    });

    await act(async () => render(<SettingsPage />));

    expect(screen.getByText('ServerMon Services')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Agent Installed')).toBeDefined());
    expect(screen.getByText('/opt/servermon-agent/source')).toBeDefined();
  });

  it('opens update history from the ServerMon Services card', async () => {
    await act(async () => render(<SettingsPage />));

    await act(async () => {
      fireEvent.click(screen.getByText('History & Logs'));
    });

    expect(screen.getByTestId('update-history-modal')).toBeDefined();
  });
});
