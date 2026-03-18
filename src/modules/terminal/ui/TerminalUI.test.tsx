import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// ── Shared mock references (hoisted so they're available in vi.mock factories) ─

const mockTermWrite = vi.fn();
const mockTermDispose = vi.fn();
const mockTermGetSelection = vi.fn(() => '');
const mockTermLoadAddon = vi.fn();
const mockTermOpen = vi.fn();
const mockFitAddonFit = vi.fn();
const mockSocketEmit = vi.fn();
const mockSocketOn = vi.fn();
const mockSocketDisconnect = vi.fn();

let capturedSocketHandlers: Record<string, (...args: unknown[]) => void> = {};

const mockSocket = {
  emit: mockSocketEmit,
  on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    capturedSocketHandlers[event] = handler;
    mockSocketOn(event, handler);
  }),
  disconnect: mockSocketDisconnect,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockTerminalOptions: Record<string, any> = {};
const mockTerminalInstance = {
  write: mockTermWrite,
  dispose: mockTermDispose,
  getSelection: mockTermGetSelection,
  loadAddon: mockTermLoadAddon,
  open: mockTermOpen,
  onData: vi.fn(),
  onResize: vi.fn(),
  get options() {
    return mockTerminalOptions;
  },
  cols: 80,
  rows: 24,
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

vi.mock('@xterm/xterm', () => ({
  // Using a regular function so `new Terminal()` works
  Terminal: vi.fn(function (this: typeof mockTerminalInstance) {
    Object.assign(this, mockTerminalInstance);
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  // Using a regular function so `new FitAddon()` works
  FitAddon: vi.fn(function (this: { fit: typeof mockFitAddonFit }) {
    this.fit = mockFitAddonFit;
  }),
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

vi.mock('@/lib/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      id: 'default',
      mode: 'dark',
      colors: {
        background: '#000',
        foreground: '#fff',
        primary: '#6366f1',
        destructive: '#ef4444',
        accent: '#8b5cf6',
        warning: '#f59e0b',
        success: '#22c55e',
      },
    },
  }),
}));

// ── Import the component AFTER mocks are set up ────────────────────────────────

async function importTerminalUI() {
  const mod = await import('./TerminalUI');
  return mod.default;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TerminalUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSocketHandlers = {};
    // Stub ResizeObserver which is not available in jsdom
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

  it('renders a container div', async () => {
    const TerminalUI = await importTerminalUI();
    const { container } = render(<TerminalUI sessionId="sess-1" />);
    expect(container.querySelector('div')).toBeDefined();
  });

  it('initializes Terminal on mount', async () => {
    const { Terminal } = await import('@xterm/xterm');
    const TerminalUI = await importTerminalUI();
    render(<TerminalUI sessionId="sess-1" />);
    expect(Terminal).toHaveBeenCalled();
  });

  it('loads FitAddon on mount', async () => {
    const { FitAddon } = await import('@xterm/addon-fit');
    const TerminalUI = await importTerminalUI();
    render(<TerminalUI sessionId="sess-1" />);
    expect(FitAddon).toHaveBeenCalled();
  });

  it('creates a socket.io connection on mount', async () => {
    const { io } = await import('socket.io-client');
    const TerminalUI = await importTerminalUI();
    render(<TerminalUI sessionId="sess-1" />);
    expect(io).toHaveBeenCalled();
  });

  it('calls onStatusChange with "connecting" before socket connects', async () => {
    const onStatusChange = vi.fn();
    const TerminalUI = await importTerminalUI();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);
    expect(onStatusChange).toHaveBeenCalledWith('connecting');
  });

  it('calls onStatusChange with "connected" when socket connects', async () => {
    const onStatusChange = vi.fn();
    const TerminalUI = await importTerminalUI();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);

    await act(async () => {
      capturedSocketHandlers['connect']?.();
    });

    expect(onStatusChange).toHaveBeenCalledWith('connected');
  });

  it('emits terminal:start on connect with session info', async () => {
    const TerminalUI = await importTerminalUI();
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
    const TerminalUI = await importTerminalUI();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);

    await act(async () => {
      capturedSocketHandlers['disconnect']?.();
    });

    expect(onStatusChange).toHaveBeenCalledWith('disconnected');
  });

  it('calls onStatusChange with "disconnected" on connect_error', async () => {
    const onStatusChange = vi.fn();
    const TerminalUI = await importTerminalUI();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);

    await act(async () => {
      capturedSocketHandlers['connect_error']?.();
    });

    expect(onStatusChange).toHaveBeenCalledWith('disconnected');
  });

  it('writes incoming terminal:data to the xterm instance', async () => {
    const TerminalUI = await importTerminalUI();
    render(<TerminalUI sessionId="sess-1" />);

    await act(async () => {
      capturedSocketHandlers['terminal:data']?.('hello world');
    });

    expect(mockTermWrite).toHaveBeenCalledWith('hello world');
  });

  it('writes error message when terminal:error is received', async () => {
    const onStatusChange = vi.fn();
    const TerminalUI = await importTerminalUI();
    render(<TerminalUI sessionId="sess-1" onStatusChange={onStatusChange} />);

    await act(async () => {
      capturedSocketHandlers['terminal:error']?.('Connection refused');
    });

    expect(mockTermWrite).toHaveBeenCalledWith(expect.stringContaining('Connection refused'));
    expect(onStatusChange).toHaveBeenCalledWith('disconnected');
  });

  it('disconnects socket and disposes terminal on unmount', async () => {
    const TerminalUI = await importTerminalUI();
    const { unmount } = render(<TerminalUI sessionId="sess-1" />);
    unmount();
    expect(mockSocketDisconnect).toHaveBeenCalled();
    expect(mockTermDispose).toHaveBeenCalled();
  });

  it('updates font size when fontSize prop changes', async () => {
    const TerminalUI = await importTerminalUI();
    const { rerender } = render(<TerminalUI sessionId="sess-1" fontSize={14} />);
    rerender(<TerminalUI sessionId="sess-1" fontSize={18} />);
    expect(mockTerminalOptions.fontSize).toBe(18);
    expect(mockFitAddonFit).toHaveBeenCalled();
  });

  it('sends initialCommand to socket when it changes', async () => {
    const TerminalUI = await importTerminalUI();
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
