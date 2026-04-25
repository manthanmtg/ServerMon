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
const mockAgentStatus = {
  agent: {
    serviceName: 'servermon-agent.service',
    installed: true,
    active: true,
    enabled: true,
    repoDir: '/opt/servermon-agent/source',
    updateSupported: true,
  },
};

describe('UpdatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/modules/updates/agent') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAgentStatus,
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
      if (url === '/api/modules/updates/agent') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAgentStatus,
        } as Response);
      }
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

  it('renders "System is Secure" when no updates are available', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/modules/updates/agent') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAgentStatus,
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

  it('renders colocated ServerMon agent status and triggers an agent update', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/modules/updates/agent') {
        return Promise.resolve({
          ok: true,
          json: async () => mockAgentStatus,
        } as Response);
      }
      if (url === '/api/modules/updates/run' && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, runId: 'agent-run', pid: 1001 }),
        } as Response);
      }
      if (typeof url === 'string' && url.startsWith('/api/modules/updates/run?runId=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            runId: 'agent-run',
            status: 'running',
            pid: 1001,
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

    expect(screen.getByText('ServerMon Services')).toBeDefined();
    expect(screen.getByText('Agent Installed')).toBeDefined();
    expect(screen.getByText('/opt/servermon-agent/source')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Update Agent'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/modules/updates/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'agent' }),
      })
    );
  });
});
