import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EventEmitter } from 'node:events';
import type { Socket } from 'socket.io-client';
import { useTtySession, FLEET_TTY_SOCKET_NAMESPACE } from './useTtySession';
import { TTY_MSG } from '@/lib/fleet/tty-bridge';

interface FakeSocket extends EventEmitter {
  emit: EventEmitter['emit'] & ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  connected: boolean;
}

function makeFakeSocket(): FakeSocket {
  const socket = new EventEmitter() as FakeSocket;
  const originalEmit = socket.emit.bind(socket);
  socket.emit = vi.fn((...args: unknown[]) =>
    originalEmit(...(args as [string, ...unknown[]]))
  ) as FakeSocket['emit'];
  socket.disconnect = vi.fn();
  socket.connected = false;
  return socket;
}

interface Capture {
  socket: FakeSocket;
  factory: ReturnType<typeof vi.fn>;
  factoryArgs: Array<{ url: string; opts: Record<string, unknown> }>;
}

function makeFactory(): Capture {
  const socket = makeFakeSocket();
  const factoryArgs: Array<{ url: string; opts: Record<string, unknown> }> = [];
  const factory = vi.fn((url: string, opts: Record<string, unknown>) => {
    factoryArgs.push({ url, opts });
    return socket as unknown as Socket;
  });
  return { socket, factory, factoryArgs };
}

describe('useTtySession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects to the fleet tty namespace with websocket transport', () => {
    const { factory, factoryArgs } = makeFactory();
    renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factoryArgs[0].url).toBe(FLEET_TTY_SOCKET_NAMESPACE);
    expect(factoryArgs[0].opts).toEqual({ transports: ['websocket'] });
  });

  it('does not connect when enabled=false', () => {
    const { factory } = makeFactory();
    renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        enabled: false,
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it('emits OPEN with full payload on connect', () => {
    const { socket, factory } = makeFactory();
    renderHook(() =>
      useTtySession({
        nodeId: 'node-abc',
        sessionId: 'sess-1',
        cols: 120,
        rows: 40,
        shell: '/bin/bash',
        cwd: '/home/dev',
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );

    act(() => {
      socket.emit('connect');
    });

    expect(socket.emit).toHaveBeenCalledWith(TTY_MSG.OPEN, {
      nodeId: 'node-abc',
      sessionId: 'sess-1',
      cols: 120,
      rows: 40,
      shell: '/bin/bash',
      cwd: '/home/dev',
    });
  });

  it('sets connected=true on connect event', () => {
    const { socket, factory } = makeFactory();
    const { result } = renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );

    expect(result.current.connected).toBe(false);
    act(() => {
      socket.emit('connect');
    });
    expect(result.current.connected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets connected=false on disconnect event', () => {
    const { socket, factory } = makeFactory();
    const { result } = renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      socket.emit('connect');
    });
    expect(result.current.connected).toBe(true);
    act(() => {
      socket.emit('disconnect');
    });
    expect(result.current.connected).toBe(false);
  });

  it('sets error on connect_error', () => {
    const { socket, factory } = makeFactory();
    const { result } = renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      socket.emit('connect_error', new Error('boom'));
    });
    expect(result.current.error).toBe('boom');
    expect(result.current.connected).toBe(false);
  });

  it('calls onData when DATA frames arrive for the matching session', () => {
    const { socket, factory } = makeFactory();
    const onData = vi.fn();
    renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        onData,
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      socket.emit(TTY_MSG.DATA, { sessionId: 's1', data: 'hello' });
    });
    expect(onData).toHaveBeenCalledWith('hello');
  });

  it('ignores DATA frames for other sessions', () => {
    const { socket, factory } = makeFactory();
    const onData = vi.fn();
    renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        onData,
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      socket.emit(TTY_MSG.DATA, { sessionId: 'other', data: 'hello' });
    });
    expect(onData).not.toHaveBeenCalled();
  });

  it('calls onExit when EXIT arrives', () => {
    const { socket, factory } = makeFactory();
    const onExit = vi.fn();
    renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        onExit,
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      socket.emit(TTY_MSG.EXIT, { sessionId: 's1', exitCode: 0, signal: null });
    });
    expect(onExit).toHaveBeenCalledWith({ exitCode: 0, signal: null });
  });

  it('calls onReady and sets ready=true on READY', () => {
    const { socket, factory } = makeFactory();
    const onReady = vi.fn();
    const { result } = renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        onReady,
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      socket.emit(TTY_MSG.READY, { sessionId: 's1' });
    });
    expect(onReady).toHaveBeenCalled();
    expect(result.current.ready).toBe(true);
  });

  it('calls onError and sets error on ERROR', () => {
    const { socket, factory } = makeFactory();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        onError,
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      socket.emit(TTY_MSG.ERROR, { sessionId: 's1', message: 'bad thing' });
    });
    expect(onError).toHaveBeenCalledWith('bad thing');
    expect(result.current.error).toBe('bad thing');
  });

  it('send() emits DATA with sessionId and payload', () => {
    const { socket, factory } = makeFactory();
    const { result } = renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      result.current.send('ls\n');
    });
    expect(socket.emit).toHaveBeenCalledWith(TTY_MSG.DATA, {
      sessionId: 's1',
      data: 'ls\n',
    });
  });

  it('resize() emits RESIZE with cols and rows', () => {
    const { socket, factory } = makeFactory();
    const { result } = renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      result.current.resize(100, 30);
    });
    expect(socket.emit).toHaveBeenCalledWith(TTY_MSG.RESIZE, {
      sessionId: 's1',
      cols: 100,
      rows: 30,
    });
  });

  it('close() emits CLOSE and disconnects the socket', () => {
    const { socket, factory } = makeFactory();
    const { result } = renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    act(() => {
      result.current.close();
    });
    expect(socket.emit).toHaveBeenCalledWith(TTY_MSG.CLOSE, { sessionId: 's1' });
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('emits CLOSE and disconnects on unmount', () => {
    const { socket, factory } = makeFactory();
    const { unmount } = renderHook(() =>
      useTtySession({
        nodeId: 'n1',
        sessionId: 's1',
        socketFactory: factory as unknown as (url: string, opts: Record<string, unknown>) => Socket,
      })
    );
    unmount();
    expect(socket.emit).toHaveBeenCalledWith(TTY_MSG.CLOSE, { sessionId: 's1' });
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
