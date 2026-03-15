'use client';

import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '@/lib/ThemeContext';
import { io, Socket } from 'socket.io-client';

interface TerminalUIProps {
  sessionId: string;
  label?: string;
  username?: string;
  fontSize?: number;
  onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting') => void;
  initialCommand?: string;
}

function buildTheme(colors: Record<string, string>) {
  return {
    background: colors.background,
    foreground: colors.foreground,
    cursor: colors.primary,
    cursorAccent: colors.background,
    selectionBackground: colors.primary + '40',
    black: colors.background,
    red: colors.destructive,
    green: colors.success || colors.primary,
    yellow: colors.warning || colors.accent,
    blue: colors.primary,
    magenta: colors.accent,
    cyan: colors.primary,
    white: colors.foreground,
  };
}

export default function TerminalUI({
  sessionId,
  label,
  username,
  fontSize = 14,
  onStatusChange,
  initialCommand,
}: TerminalUIProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastCommandRef = useRef<string | undefined>(undefined);
  const { theme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize,
      theme: buildTheme(theme.colors as unknown as Record<string, string>),
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const socket = io({ path: '/api/socket' });
    socketRef.current = socket;

    onStatusChange?.('connecting');

    socket.on('connect', () => {
      onStatusChange?.('connected');
      lastCommandRef.current = initialCommand;
      socket.emit('terminal:start', {
        sessionId,
        label,
        username,
        cols: term.cols,
        rows: term.rows,
        initialCommand,
      });

      fetch('/api/terminal/sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, lastActiveAt: new Date().toISOString() }),
      }).catch(() => {});
    });

    socket.on('connect_error', () => {
      onStatusChange?.('disconnected');
    });

    socket.on('disconnect', () => {
      onStatusChange?.('disconnected');
    });

    socket.on('terminal:data', (data: string) => {
      term.write(data);
    });

    socket.on('terminal:error', (error: string) => {
      term.write(`\r\n\x1b[31m[Error] ${error}\x1b[0m\r\n`);
      onStatusChange?.('disconnected');
    });

    term.onData((data) => {
      socket.emit('terminal:data', data);
    });

    term.onResize((size) => {
      socket.emit('terminal:resize', { cols: size.cols, rows: size.rows });
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => fitAddon.fit());
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      socket.disconnect();
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = buildTheme(
        theme.colors as unknown as Record<string, string>
      );
    }
  }, [theme.colors]);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  useEffect(() => {
    if (!initialCommand || initialCommand === lastCommandRef.current) {
      return;
    }
    lastCommandRef.current = initialCommand;
    socketRef.current?.emit('terminal:data', initialCommand);
  }, [initialCommand]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[300px] overflow-hidden p-1"
      style={{ backgroundColor: theme.colors.background }}
    />
  );
}
