'use client';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { TTY_MSG } from '@/lib/fleet/tty-bridge';

export interface UseTtySessionOpts {
  nodeId: string;
  sessionId: string;
  cols?: number;
  rows?: number;
  shell?: string;
  cwd?: string;
  enabled?: boolean;
  onData?: (data: string) => void;
  onExit?: (info: { exitCode: number | null; signal: string | null }) => void;
  onError?: (msg: string) => void;
  onReady?: () => void;
  socketFactory?: (url: string, opts: Record<string, unknown>) => Socket;
}

export interface UseTtySessionState {
  connected: boolean;
  ready: boolean;
  error: string | null;
  send(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

export const FLEET_TTY_SOCKET_NAMESPACE = '/api/fleet/tty';

export function useTtySession(opts: UseTtySessionOpts): UseTtySessionState {
  const {
    nodeId,
    sessionId,
    cols,
    rows,
    shell,
    cwd,
    enabled = true,
    onData,
    onExit,
    onError,
    onReady,
    socketFactory,
  } = opts;

  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Keep latest callbacks without re-triggering the connect effect
  const onDataRef = useRef(onData);
  const onExitRef = useRef(onExit);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!enabled) return;

    const connect = socketFactory ?? ((url, o) => io(url, o) as Socket);
    const socket = connect(FLEET_TTY_SOCKET_NAMESPACE, {
      transports: ['websocket'],
      path: '/api/socket',
    });
    socketRef.current = socket;

    const handleConnect = (): void => {
      setConnected(true);
      setError(null);
      socket.emit(TTY_MSG.OPEN, {
        nodeId,
        sessionId,
        cols,
        rows,
        shell,
        cwd,
      });
    };
    const handleDisconnect = (): void => {
      setConnected(false);
      setReady(false);
    };
    const handleConnectError = (err: unknown): void => {
      const msg = err instanceof Error ? err.message : String(err);
      setConnected(false);
      setError(msg);
    };
    const handleData = (payload: { sessionId: string; data: string }): void => {
      if (!payload || payload.sessionId !== sessionId) return;
      onDataRef.current?.(payload.data);
    };
    const handleExit = (payload: {
      sessionId: string;
      exitCode: number | null;
      signal: string | null;
    }): void => {
      if (!payload || payload.sessionId !== sessionId) return;
      onExitRef.current?.({ exitCode: payload.exitCode, signal: payload.signal });
    };
    const handleError = (payload: { sessionId: string; message: string }): void => {
      if (!payload) return;
      if (payload.sessionId && payload.sessionId !== sessionId) return;
      setError(payload.message);
      onErrorRef.current?.(payload.message);
    };
    const handleReady = (payload: { sessionId: string }): void => {
      if (!payload || payload.sessionId !== sessionId) return;
      setReady(true);
      onReadyRef.current?.();
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on(TTY_MSG.DATA, handleData);
    socket.on(TTY_MSG.EXIT, handleExit);
    socket.on(TTY_MSG.ERROR, handleError);
    socket.on(TTY_MSG.READY, handleReady);

    // If the fake socket already emitted connect synchronously, or we're
    // reconnecting in tests, ensure OPEN fires when already connected.
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      try {
        socket.emit(TTY_MSG.CLOSE, { sessionId });
      } catch {
        // swallow
      }
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off(TTY_MSG.DATA, handleData);
      socket.off(TTY_MSG.EXIT, handleExit);
      socket.off(TTY_MSG.ERROR, handleError);
      socket.off(TTY_MSG.READY, handleReady);
      try {
        socket.disconnect();
      } catch {
        // swallow
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setConnected(false);
      setReady(false);
    };
    // socketFactory intentionally excluded — it's expected to be stable (test-only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nodeId, sessionId, cols, rows, shell, cwd]);

  const send = (data: string): void => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit(TTY_MSG.DATA, { sessionId, data });
  };

  const resize = (c: number, r: number): void => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit(TTY_MSG.RESIZE, { sessionId, cols: c, rows: r });
  };

  const close = (): void => {
    const socket = socketRef.current;
    if (!socket) return;
    try {
      socket.emit(TTY_MSG.CLOSE, { sessionId });
    } catch {
      // swallow
    }
    try {
      socket.disconnect();
    } catch {
      // swallow
    }
  };

  return { connected, ready, error, send, resize, close };
}
