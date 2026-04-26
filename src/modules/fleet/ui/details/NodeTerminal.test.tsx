import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Hoisted mock refs
const {
  mockUseTtySession,
  mockSend,
  mockResize,
  mockClose,
  MockTerminal,
  mockTerminalInstance,
  mockFitAddonFit,
} = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockResize = vi.fn();
  const mockClose = vi.fn();
  // Typed with the full hook shape so .mock.calls / .mockReturnValue keep type info.
  const mockUseTtySession = vi.fn<
    (opts: import('@/modules/fleet/ui/lib/useTtySession').UseTtySessionOpts) => {
      connected: boolean;
      ready: boolean;
      error: string | null;
      send: (data: string) => void;
      resize: (cols: number, rows: number) => void;
      close: () => void;
    }
  >(() => ({
    connected: false,
    ready: false,
    error: null,
    send: mockSend,
    resize: mockResize,
    close: mockClose,
  }));
  const mockTerminalInstance = {
    write: vi.fn(),
    writeln: vi.fn(),
    dispose: vi.fn(),
    clear: vi.fn(),
    focus: vi.fn(),
    getSelection: vi.fn(() => ''),
    loadAddon: vi.fn(),
    open: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onResize: vi.fn(() => ({ dispose: vi.fn() })),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockTerminal = vi.fn(function (this: any) {
    Object.assign(this, mockTerminalInstance);
  });
  const mockFitAddonFit = vi.fn();
  return {
    mockUseTtySession,
    mockSend,
    mockResize,
    mockClose,
    MockTerminal,
    mockTerminalInstance,
    mockFitAddonFit,
  };
});

vi.mock('@/modules/fleet/ui/lib/useTtySession', () => ({
  useTtySession: mockUseTtySession,
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: MockTerminal,
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function (this: { fit: typeof mockFitAddonFit }) {
    this.fit = mockFitAddonFit;
  }),
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

// Import after mocks
import { NodeTerminal } from './NodeTerminal';

describe('NodeTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window.localStorage?.clear === 'function') {
      window.localStorage.clear();
    }
    mockUseTtySession.mockReturnValue({
      connected: false,
      ready: false,
      error: null,
      send: mockSend,
      resize: mockResize,
      close: mockClose,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MockTerminal as any).mockImplementation(function (this: any) {
      Object.assign(this, mockTerminalInstance);
    });
  });

  it('renders the Terminal card title', () => {
    render(<NodeTerminal nodeId="node-xyz" />);
    expect(screen.getByText('Terminal')).toBeDefined();
  });

  it('shows a Start session button initially', () => {
    render(<NodeTerminal nodeId="node-xyz" />);
    expect(screen.getByRole('button', { name: /start session/i })).toBeDefined();
  });

  it('shows the placeholder text before session starts', () => {
    render(<NodeTerminal nodeId="node-xyz" />);
    expect(screen.getByText(/interactive shell on node/i)).toBeDefined();
    expect(screen.getAllByText(/node-xyz/).length).toBeGreaterThan(0);
  });

  it('does not call useTtySession with enabled=true before start', () => {
    render(<NodeTerminal nodeId="node-xyz" />);
    const lastCall = mockUseTtySession.mock.calls[mockUseTtySession.mock.calls.length - 1];
    expect(lastCall?.[0]?.enabled).toBe(false);
  });

  it('clicking Start session enables the session and renders the xterm container', () => {
    render(<NodeTerminal nodeId="node-xyz" />);
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    // The button flips to "End session"
    expect(screen.getByRole('button', { name: /end session/i })).toBeDefined();
    // The xterm container is rendered
    expect(screen.getByTestId('fleet-terminal-container')).toBeDefined();
    // Hook was re-invoked with enabled=true
    const lastCall = mockUseTtySession.mock.calls[mockUseTtySession.mock.calls.length - 1];
    expect(lastCall?.[0]?.enabled).toBe(true);
  });

  it('clicking End session removes the xterm container', () => {
    render(<NodeTerminal nodeId="node-xyz" />);
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    expect(screen.getByTestId('fleet-terminal-container')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    expect(screen.queryByTestId('fleet-terminal-container')).toBeNull();
    expect(screen.getByRole('button', { name: /start session/i })).toBeDefined();
  });

  it('shows a connecting indicator when started but not yet connected', () => {
    mockUseTtySession.mockReturnValue({
      connected: false,
      ready: false,
      error: null,
      send: mockSend,
      resize: mockResize,
      close: mockClose,
    });
    render(<NodeTerminal nodeId="node-xyz" />);
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    expect(screen.getByText(/connecting/i)).toBeDefined();
  });

  it('shows a connected indicator when session.connected is true', () => {
    mockUseTtySession.mockReturnValue({
      connected: true,
      ready: false,
      error: null,
      send: mockSend,
      resize: mockResize,
      close: mockClose,
    });
    render(<NodeTerminal nodeId="node-xyz" />);
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    expect(screen.getByText(/connected/i)).toBeDefined();
  });

  it('shows error indicator when session.error is set', () => {
    mockUseTtySession.mockReturnValue({
      connected: false,
      ready: false,
      error: 'auth failed',
      send: mockSend,
      resize: mockResize,
      close: mockClose,
    });
    render(<NodeTerminal nodeId="node-xyz" />);
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    expect(screen.getByText(/auth failed/)).toBeDefined();
  });

  it('passes nodeId to useTtySession', () => {
    render(<NodeTerminal nodeId="node-42" />);
    const lastCall = mockUseTtySession.mock.calls[mockUseTtySession.mock.calls.length - 1];
    expect(lastCall?.[0]?.nodeId).toBe('node-42');
  });

  it('creates an additional fleet terminal tab', () => {
    render(<NodeTerminal nodeId="node-xyz" />);
    fireEvent.click(screen.getByTitle(/new tab/i));
    expect(screen.getAllByText('Shell 2').length).toBeGreaterThan(0);

    const lastCall = mockUseTtySession.mock.calls[mockUseTtySession.mock.calls.length - 1];
    expect(lastCall?.[0]?.enabled).toBe(false);
  });

  it('sends quick commands to the active session', async () => {
    render(<NodeTerminal nodeId="node-xyz" />);
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    fireEvent.click(screen.getByRole('button', { name: /^uptime$/i }));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith('uptime\n');
    });
  });
});
