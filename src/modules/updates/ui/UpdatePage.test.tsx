import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import UpdatePage from './UpdatePage';
import { ToastProvider } from '@/components/ui/toast';

// Mock Recharts to avoid issues in JSDOM
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div style={{ width: '100%', height: '100%' }}>{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

// Mock ConfirmationModal
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

const mockSnapshot = {
  osName: 'Ubuntu',
  osVersion: '22.04 LTS',
  lastCheck: new Date().toISOString(),
  pendingRestart: true,
  restartRequiredBy: ['linux-image-generic'],
  counts: {
    security: 3,
    regular: 10,
    optional: 2,
    language: 5,
  },
  updates: [
    {
      name: 'linux-image-generic',
      currentVersion: '5.15.0-50',
      newVersion: '5.15.0-51',
      manager: 'apt',
      repository: 'main',
      severity: 'critical',
    },
    {
      name: 'nginx',
      currentVersion: '1.18.0',
      newVersion: '1.20.0',
      manager: 'apt',
      repository: 'universe',
      severity: 'high',
    },
  ],
  history: [{ timestamp: new Date().toISOString(), count: 5, success: true }],
};

const mockRunHistory = { runs: [] };
describe('UpdatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/modules/updates/run') {
        return Promise.resolve({
          ok: true,
          json: async () => mockRunHistory,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockSnapshot,
      } as Response);
    });
  });

  const renderPage = async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <ToastProvider>
          <UpdatePage />
        </ToastProvider>
      );
    });
    return result!;
  };

  it('renders loading state initially', async () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise<Response>(() => {}));

    render(
      <ToastProvider>
        <UpdatePage />
      </ToastProvider>
    );

    expect(screen.getByText('Loading updates...')).toBeDefined();
  });

  it('renders snapshot data correctly', async () => {
    await renderPage();

    expect(screen.getByText('System Updates')).toBeDefined();
    expect(screen.getByText(/Ubuntu 22.04 LTS/i)).toBeDefined();

    // Check status cards
    expect(screen.getByText('3')).toBeDefined(); // Security
    expect(screen.getByText('10')).toBeDefined(); // Regular
    expect(screen.getByText('5')).toBeDefined(); // Language
    expect(screen.getByText('Yes')).toBeDefined(); // Reboot Required

    // Check updates table
    expect(screen.getByText('linux-image-generic')).toBeDefined();
    expect(screen.getByText('nginx')).toBeDefined();
    expect(screen.getByText('critical')).toBeDefined();
    expect(screen.getByText('high')).toBeDefined();
  });

  it('handles "Check for Updates" button click', async () => {
    await renderPage();
    const checkButton = screen.getByText('Check for Updates');

    await act(async () => {
      fireEvent.click(checkButton);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/updates',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ force: true }),
      })
    );
  });

  it('announces the history panel expanded state', async () => {
    await renderPage();
    const historyButton = screen.getByRole('button', { name: 'History' });

    expect(historyButton.getAttribute('aria-expanded')).toBe('false');
    expect(historyButton.getAttribute('aria-controls')).toBe('update-run-history');

    await act(async () => {
      fireEvent.click(historyButton);
    });

    expect(historyButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('update-run-history').id).toBe('update-run-history');
  });

  it('opens confirmation modal when "Update All" is clicked', async () => {
    await renderPage();

    // There are multiple "Update All" buttons (header + table). Click the first one.
    const updateButtons = screen.getAllByText('Update All');
    expect(updateButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(updateButtons[0]);
    });

    expect(screen.getByTestId('confirmation-modal')).toBeDefined();
    expect(screen.getByText('Install System Updates')).toBeDefined();
  });

  it('triggers update when confirmation is accepted', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/modules/updates/run' && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, runId: 'test-123', pid: 9999 }),
        } as Response);
      }
      if (typeof url === 'string' && url.startsWith('/api/modules/updates/run?runId=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            runId: 'test-123',
            status: 'running',
            pid: 9999,
            startedAt: new Date().toISOString(),
            exitCode: null,
            timestamp: new Date().toISOString(),
          }),
        } as Response);
      }
      if (url === '/api/modules/updates/run') {
        return Promise.resolve({
          ok: true,
          json: async () => mockRunHistory,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockSnapshot,
      } as Response);
    });

    await renderPage();

    // Click "Update All" to open confirmation
    const updateButtons = screen.getAllByText('Update All');
    await act(async () => {
      fireEvent.click(updateButtons[0]);
    });

    // Click "Confirm" in the modal
    const confirmButton = screen.getByText('Confirm');
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    // Verify the POST to /api/modules/updates/run was called with type: packages
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/updates/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'packages' }),
      })
    );

    // Should show "Installing Updates..." progress
    await waitFor(() => {
      expect(screen.getByText('Installing Updates...')).toBeDefined();
    });
  });

  it('labels the update log auto-scroll control with its pressed state', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/modules/updates/run' && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, runId: 'test-123', pid: 9999 }),
        } as Response);
      }
      if (typeof url === 'string' && url.startsWith('/api/modules/updates/run?runId=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            runId: 'test-123',
            status: 'running',
            pid: 9999,
            startedAt: new Date().toISOString(),
            exitCode: null,
            timestamp: new Date().toISOString(),
            logContent: 'Reading package lists...\nInstalling nginx...',
          }),
        } as Response);
      }
      if (url === '/api/modules/updates/run') {
        return Promise.resolve({
          ok: true,
          json: async () => mockRunHistory,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockSnapshot,
      } as Response);
    });

    await renderPage();

    const updateButtons = screen.getAllByText('Update All');
    await act(async () => {
      fireEvent.click(updateButtons[0]);
    });

    const confirmButton = screen.getByText('Confirm');
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    const autoScrollButton = await screen.findByRole('button', {
      name: 'Disable update log auto-scroll',
    });

    expect(autoScrollButton.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      fireEvent.click(autoScrollButton);
    });

    expect(
      screen
        .getByRole('button', { name: 'Enable update log auto-scroll' })
        .getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('renders "System is Secure" when no updates are available', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/modules/updates/run') {
        return Promise.resolve({
          ok: true,
          json: async () => mockRunHistory,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ...mockSnapshot,
          counts: { security: 0, regular: 0, optional: 0, language: 0 },
          updates: [],
          pendingRestart: false,
        }),
      });
    });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText('System is Secure')).toBeDefined();
      expect(screen.getByText('No')).toBeDefined(); // Reboot Required
    });
  });

  it('handles fetch errors with a toast', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to load'));

    await renderPage();

    expect(global.fetch).toHaveBeenCalled();
  });

  it('does not render ServerMon service controls in system updates', async () => {
    await renderPage();

    expect(screen.queryByText('ServerMon Services')).toBeNull();
    expect(screen.queryByText('Agent Installed')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalledWith('/api/modules/updates/agent');
  });
});
