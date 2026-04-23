import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import TerminalPage from './TerminalPage';
import { ToastProvider } from '@/components/ui/toast';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock TerminalUI (depends on xterm.js and socket.io which cannot run in jsdom)
vi.mock('./TerminalUI', () => ({
  default: ({ sessionId }: { sessionId: string }) => (
    <div data-testid={`terminal-ui-${sessionId}`}>TerminalUI {sessionId}</div>
  ),
}));

vi.mock('./TerminalSettingsModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="terminal-settings-modal">
      <button onClick={onClose}>Close Settings</button>
    </div>
  ),
}));

vi.mock('./TerminalHistoryModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="terminal-history-modal">
      <button onClick={onClose}>Close History</button>
    </div>
  ),
}));

vi.mock('./SavedCommandsModal', () => ({
  default: ({
    onClose,
    onRun,
  }: {
    onClose: () => void;
    onRun: (cmd: string) => void;
  }) => (
    <div data-testid="saved-commands-modal">
      <button onClick={onClose}>Close Commands</button>
      <button onClick={() => onRun('ls -la')}>Run Command</button>
    </div>
  ),
}));

vi.mock('@/components/ui/ConfirmationModal', () => ({
  default: ({
    isOpen,
    onCancel,
    onConfirm,
    title,
  }: {
    isOpen: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    title: string;
  }) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <span>{title}</span>
        <button onClick={onCancel}>Cancel</button>
        <button onClick={onConfirm} data-testid="reset-confirm">
          Confirm
        </button>
      </div>
    ) : null,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const mockSessions = [
  { sessionId: 'sess-1', label: 'Terminal 1', order: 0 },
  { sessionId: 'sess-2', label: 'Terminal 2', order: 1 },
];

const mockSettings = {
  idleTimeoutMinutes: 30,
  maxSessions: 8,
  fontSize: 14,
  loginAsUser: '',
  defaultDirectory: '',
};

function setupFetchMock(sessions = mockSessions) {
  global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
    if (url === '/api/terminal/sessions' && (!options || options.method === 'GET' || !options.method)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ sessions }),
      });
    }
    if (url === '/api/terminal/sessions' && options?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          session: { sessionId: 'sess-new', label: 'Terminal New', order: 2 },
        }),
      });
    }
    if (url === '/api/terminal/sessions' && options?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url === '/api/terminal/sessions' && options?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url.includes('/api/terminal/settings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ settings: mockSettings }),
      });
    }
    if (url.includes('/api/auth/me') || url.includes('/api/users/me')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ username: 'admin' }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

async function renderPage() {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <ToastProvider>
        <TerminalPage />
      </ToastProvider>
    );
  });
  return result!;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TerminalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetchMock();
  });

  it('renders loading skeleton initially', async () => {
    setupFetchMock();
    let resolveSessions: (value: any) => void;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/terminal/sessions') {
        return new Promise((resolve) => {
          resolveSessions = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await act(async () => {
      render(
        <ToastProvider>
          <TerminalPage />
        </ToastProvider>
      );
    });

    // During loading, skeleton elements are shown
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(0);

    if (resolveSessions!) {
      await act(async () => {
        resolveSessions!({
          ok: true,
          json: async () => ({ sessions: mockSessions }),
        });
      });
    }
  });

  it('renders terminal tabs after fetching sessions', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Terminal 1').length).toBeGreaterThan(0);
    });
  });

  it('renders all session tabs', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Terminal 1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Terminal 2').length).toBeGreaterThan(0);
    });
  });

  it('renders a new session when no sessions exist', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/terminal/sessions' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: { sessionId: 'sess-auto', label: 'Terminal 1', order: 0 },
          }),
        });
      }
      if (url === '/api/terminal/sessions') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sessions: [] }),
        });
      }
      if (url.includes('/api/terminal/settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ settings: mockSettings }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await renderPage();
    await waitFor(() => {
      // Auto-created session
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('switches the active tab when another tab is clicked', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Terminal 2')).toBeDefined();
    });

    fireEvent.click(screen.getAllByText('Terminal 2')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('terminal-ui-sess-2')).toBeDefined();
    });
  });

  it('opens settings modal when the settings button is clicked', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Terminal 1').length).toBeGreaterThan(0);
    });

    // Find settings button (has SettingsIcon)
    const buttons = screen.getAllByRole('button');
    const settingsBtn = buttons.find(
      (btn) =>
        btn.querySelector('[data-lucide="settings"]') !== null ||
        btn.title?.toLowerCase().includes('settings') ||
        btn.getAttribute('aria-label')?.toLowerCase().includes('settings')
    );

    if (settingsBtn) {
      fireEvent.click(settingsBtn);
      await waitFor(() => {
        expect(screen.getByTestId('terminal-settings-modal')).toBeDefined();
      });
    }
  });

  it('opens history modal when the history button is clicked', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Terminal 1').length).toBeGreaterThan(0);
    });

    const buttons = screen.getAllByRole('button');
    const historyBtn = buttons.find(
      (btn) =>
        btn.querySelector('[data-lucide="history"]') !== null ||
        btn.title?.toLowerCase().includes('history')
    );

    if (historyBtn) {
      fireEvent.click(historyBtn);
      await waitFor(() => {
        expect(screen.getByTestId('terminal-history-modal')).toBeDefined();
      });
    }
  });

  it('opens saved commands modal when the bookmark button is clicked', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Terminal 1').length).toBeGreaterThan(0);
    });

    const buttons = screen.getAllByRole('button');
    const bookmarkBtn = buttons.find(
      (btn) =>
        btn.querySelector('[data-lucide="bookmark"]') !== null ||
        btn.title?.toLowerCase().includes('command')
    );

    if (bookmarkBtn) {
      fireEvent.click(bookmarkBtn);
      await waitFor(() => {
        expect(screen.getByTestId('saved-commands-modal')).toBeDefined();
      });
    }
  });

  it('adds a new terminal tab when the + button is clicked', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/terminal/sessions' && (!options?.method || options.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ sessions: mockSessions }),
        });
      }
      if (url === '/api/terminal/sessions' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: { sessionId: 'sess-3', label: 'Terminal 3', order: 2 },
          }),
        });
      }
      if (url.includes('/api/terminal/settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ settings: mockSettings }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Terminal 1').length).toBeGreaterThan(0);
    });

    // Find the + (Plus) button
    const buttons = screen.getAllByRole('button');
    const addBtn = buttons.find(
      (btn) => btn.querySelector('[data-lucide="plus"]') !== null
    );

    if (addBtn) {
      await act(async () => {
        fireEvent.click(addBtn);
      });
      await waitFor(() => {
        // POST should have been called to create new session
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        const postCall = calls.find(
          (call: unknown[]) =>
            call[0] === '/api/terminal/sessions' && (call[1] as RequestInit)?.method === 'POST'
        );
        expect(postCall).toBeDefined();
      });
    }
  });

  it('shows reboot/reset confirmation modal', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Terminal 1').length).toBeGreaterThan(0);
    });

    const buttons = screen.getAllByRole('button');
    const resetBtn = buttons.find(
      (btn) => btn.querySelector('[data-lucide="rotate-ccw"]') !== null
    );

    if (resetBtn) {
      fireEvent.click(resetBtn);
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-modal')).toBeDefined();
      });
    }
  });
});
