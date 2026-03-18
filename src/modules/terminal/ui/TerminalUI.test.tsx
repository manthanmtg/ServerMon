import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// ── Polyfill ResizeObserver for jsdom ──────────────────────────────────────────
if (typeof ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ── Hoisted mock refs ──────────────────────────────────────────────────────────
const {
  capturedSocketHandlers,
  mockTermWrite,
  mockTermDispose,
  mockFitAddonFit,
  mockSocketEmit,
  mockSocketDisconnect,
  mockSocket,
  MockTerminal,
  mockTerminalOptions,
  mockTerminalInstance,
  mockIo,
} = vi.hoisted(() => {
  const capturedSocketHandlers: Record<string, (...args: unknown[]) => void> = {};

  const mockTermWrite = vi.fn();
  const mockTermDispose = vi.fn();
  const mockFitAddonFit = vi.fn();
  const mockSocketEmit = vi.fn();
  const mockSocketDisconnect = vi.fn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockTerminalOptions: Record<string, any> = {};
  const mockTerminalInstance = {
    write: mockTermWrite,
    dispose: mockTermDispose,
    getSelection: vi.fn(() => ''),
    loadAddon: vi.fn(),
    open: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onResize: vi.fn(() => ({ dispose: vi.fn() })),
    get options() {
      return mockTerminalOptions;
    },
    cols: 80,
    rows: 24,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockTerminal = vi.fn(function (this: any) {
    Object.assign(this, mockTerminalInstance);
  });

  const mockSocket = {
    emit: mockSocketEmit,
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      capturedSocketHandlers[event] = handler;
    }),
    off: vi.fn(),
    disconnect: mockSocketDisconnect,
    connected: false,
  };

  const mockIo = vi.fn(() => mockSocket);

  return {
    capturedSocketHandlers,
    mockTermWrite,
    mockTermDispose,
    mockFitAddonFit,
    mockSocketEmit,
    mockSocketDisconnect,
    mockSocket,
    MockTerminal,
    mockTerminalOptions,
    mockTerminalInstance,
    mockIo,
  };
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('socket.io-client', () => ({
  io: mockIo,
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: MockTerminal,
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function (
    this: { fit: typeof mockFitAddonFit; proposeDimensions: () => { cols: number; rows: number } }
  ) {
    this.fit = mockFitAddonFit;
    this.proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
  }),
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

vi.mock('@/lib/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      id: 'default',
      mode: 'dark',
      colors: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        primary: '#89b4fa',
        destructive: '#f38ba8',
        success: '#a6e3a1',
        warning: '#f9e2af',
        accent: '#313244',
      },
    },
  }),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────
import TerminalUI from './TerminalUI';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TerminalUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear captured socket event handlers between tests
    Object.keys(capturedSocketHandlers).forEach((k) => {
      delete capturedSocketHandlers[k];
    });
    // Clear mockTerminalOptions between tests
    Object.keys(mockTerminalOptions).forEach((k) => {
      delete mockTerminalOptions[k];
    });
    // Restore mock implementations after clearAllMocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MockTerminal as any).mockImplementation(function (this: any) {
      Object.assign(this, mockTerminalInstance);
    });
    mockIo.mockImplementation(() => mockSocket);
    mockSocket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      capturedSocketHandlers[event] = handler;
    });
    // Stub ResizeObserver for consistent test environment
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        constructor(_cb: ResizeObserverCallback) {}
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Basic render tests ────────────────────────────────────────────────────────

  it('renders a container div without crashing', () => {
    const { container } = render(<TerminalUI sessionId="test-session" />);
    expect(container).toBeDefined();
    expect(container.firstChild).toBeDefined();
  });

  it('renders a div element as the root', () => {
    const { container } = render(<TerminalUI sessionId="sess-1" />);
    expect(container.querySelector('div')).toBeDefined();
  });

  it('accepts sessionId prop', () => {
    expect(() => render(<TerminalUI sessionId="unique-session-id" />)).not.toThrow();
  });

  it('accepts optional label prop', () => {
    expect(() => render(<TerminalUI sessionId="sess-1" label="My Terminal" />)).not.toThrow();
  });

  it('accepts optional username prop', () => {
    expect(() => render(<TerminalUI sessionId="sess-1" username="root" />)).not.toThrow();
  });

  it('accepts optional fontSize prop', () => {
    expect(() => render(<TerminalUI sessionId="sess-1" fontSize={16} />)).not.toThrow();
  });

  it('accepts onStatusChange callback', () => {
    const onStatusChange = vi.fn();
    expect(() =>
      render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />)
    ).not.toThrow();
  });

  it('accepts initialCommand prop', () => {
    expect(() =>
      render(<TerminalUI sessionId="sess-1" initialCommand="ls -la" />)
    ).not.toThrow();
  });

  // ── Initialization tests ──────────────────────────────────────────────────────

  it('initializes Terminal on mount', () => {
    render(<TerminalUI sessionId="sess-1" />);
    expect(MockTerminal).toHaveBeenCalled();
  });

  it('loads FitAddon on mount', async () => {
    const { FitAddon } = await import('@xterm/addon-fit');
    render(<TerminalUI sessionId="sess-1" />);
    expect(FitAddon).toHaveBeenCalled();
  });

  it('creates a socket.io connection on mount', () => {
    render(<TerminalUI sessionId="my-session" />);
    expect(mockIo).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/socket' }));
  });

  it('creates a Terminal instance with provided fontSize', () => {
    render(<TerminalUI sessionId="sess-1" fontSize={18} />);
    expect(MockTerminal).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 18 }));
  });

  it('creates a Terminal instance with default fontSize when not specified', () => {
    render(<TerminalUI sessionId="sess-1" />);
    expect(MockTerminal).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 14 }));
  });

  it('loads FitAddon into terminal', () => {
    render(<TerminalUI sessionId="sess-1" />);
    expect(mockTerminalInstance.loadAddon).toHaveBeenCalled();
  });

  it('opens terminal in the container element', () => {
    render(<TerminalUI sessionId="sess-1" />);
    expect(mockTerminalInstance.open).toHaveBeenCalled();
  });

  it('sets up socket event listeners', () => {
    render(<TerminalUI sessionId="sess-1" />);
    expect(mockSocket.on).toHaveBeenCalled();
  });

  it('registers onData handler on the terminal', () => {
    render(<TerminalUI sessionId="sess-1" />);
    expect(mockTerminalInstance.onData).toHaveBeenCalled();
  });

  // ── Status change tests ───────────────────────────────────────────────────────

  it('calls onStatusChange with "connecting" before socket connects', () => {
    const onStatusChange = vi.fn();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);
    expect(onStatusChange).toHaveBeenCalledWith('connecting');
  });

  it('calls onStatusChange with "connected" when socket connects', async () => {
    const onStatusChange = vi.fn();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);

    await act(async () => {
      capturedSocketHandlers['connect']?.();
    });

    expect(onStatusChange).toHaveBeenCalledWith('connected');
  });

  it('emits terminal:start on connect with session info', async () => {
    render(
      <TerminalUI sessionId="sess-42" label="My Terminal" username="admin" fontSize={16} />
    );

    await act(async () => {
      capturedSocketHandlers['connect']?.();
    });

    expect(mockSocketEmit).toHaveBeenCalledWith(
      'terminal:start',
      expect.objectContaining({
        sessionId: 'sess-42',
        label: 'My Terminal',
        username: 'admin',
        cols: 80,
        rows: 24,
      })
    );
  });

  it('calls onStatusChange with "disconnected" on disconnect', async () => {
    const onStatusChange = vi.fn();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);

    await act(async () => {
      capturedSocketHandlers['disconnect']?.();
    });

    expect(onStatusChange).toHaveBeenCalledWith('disconnected');
  });

  it('calls onStatusChange with "disconnected" on connect_error', async () => {
    const onStatusChange = vi.fn();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);

    await act(async () => {
      capturedSocketHandlers['connect_error']?.();
    });

    expect(onStatusChange).toHaveBeenCalledWith('disconnected');
  });

  it('writes incoming terminal:data to the xterm instance', async () => {
    render(<TerminalUI sessionId="sess-1" />);

    await act(async () => {
      capturedSocketHandlers['terminal:data']?.('hello world');
    });

    expect(mockTermWrite).toHaveBeenCalledWith('hello world');
  });

  it('writes error message when terminal:error is received', async () => {
    const onStatusChange = vi.fn();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);

    await act(async () => {
      capturedSocketHandlers['terminal:error']?.('Connection refused');
    });

    expect(mockTermWrite).toHaveBeenCalledWith(expect.stringContaining('Connection refused'));
    expect(onStatusChange).toHaveBeenCalledWith('disconnected');
  });

  // ── Cleanup tests ─────────────────────────────────────────────────────────────

  it('cleans up on unmount — disconnects socket', () => {
    const { unmount } = render(<TerminalUI sessionId="sess-1" />);
    unmount();
    expect(mockSocketDisconnect).toHaveBeenCalled();
  });

  it('cleans up on unmount — disposes terminal', () => {
    const { unmount } = render(<TerminalUI sessionId="sess-1" />);
    unmount();
    expect(mockTermDispose).toHaveBeenCalled();
  });

  it('disconnects socket and disposes terminal on unmount', () => {
    const { unmount } = render(<TerminalUI sessionId="sess-1" />);
    unmount();
    expect(mockSocketDisconnect).toHaveBeenCalled();
    expect(mockTermDispose).toHaveBeenCalled();
  });

  // ── Prop update tests ─────────────────────────────────────────────────────────

  it('updates font size when fontSize prop changes', () => {
    const { rerender } = render(<TerminalUI sessionId="sess-1" fontSize={14} />);
    rerender(<TerminalUI sessionId="sess-1" fontSize={18} />);
    expect(mockTerminalOptions.fontSize).toBe(18);
    expect(mockFitAddonFit).toHaveBeenCalled();
  });

  it('sends initialCommand to socket when it changes', async () => {
    const { rerender } = render(<TerminalUI sessionId="sess-1" />);

    await act(async () => {
      capturedSocketHandlers['connect']?.();
    });

    await act(async () => {
      rerender(<TerminalUI sessionId="sess-1" initialCommand={`ls -la\n`} />);
    });

    expect(mockSocketEmit).toHaveBeenCalledWith('terminal:data', `ls -la\n`);
  });
});
