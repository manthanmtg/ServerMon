'use client';

import { useEffect, useRef } from 'react';
import type { Terminal as XtermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTtySession } from '@/modules/fleet/ui/lib/useTtySession';
import {
  ActionRequest,
  CommandRequest,
  cssVar,
  FleetTerminalStatus,
  FleetTerminalTab,
} from './types';

interface FleetTerminalPaneProps {
  nodeId: string;
  tab: FleetTerminalTab;
  active: boolean;
  commandRequest: CommandRequest | null;
  actionRequest: ActionRequest | null;
  onStatusChange: (sessionId: string, status: FleetTerminalStatus, message?: string) => void;
  onNotice: (title: string, variant?: 'success' | 'destructive' | 'warning') => void;
}

export function FleetTerminalPane({
  nodeId,
  tab,
  active,
  commandRequest,
  actionRequest,
  onStatusChange,
  onNotice,
}: FleetTerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XtermTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sentCommandRequestRef = useRef<number | null>(null);
  const handledActionRequestRef = useRef<number | null>(null);
  const sendRef = useRef<(data: string) => void>(() => {});
  const resizeRef = useRef<(cols: number, rows: number) => void>(() => {});

  const session = useTtySession({
    nodeId,
    sessionId: tab.sessionId,
    cols: 100,
    rows: 30,
    enabled: tab.started,
    onData: (data) => termRef.current?.write(data),
    onReady: () => onStatusChange(tab.sessionId, 'connected'),
    onExit: (info) => {
      termRef.current?.writeln(
        `\r\n\u001b[33m[session ended: code=${info.exitCode} signal=${info.signal}]\u001b[0m`
      );
      onStatusChange(tab.sessionId, 'disconnected');
    },
    onError: (message) => {
      termRef.current?.writeln(`\r\n\u001b[31m[error: ${message}]\u001b[0m`);
      onStatusChange(tab.sessionId, 'error', message);
    },
  });

  useEffect(() => {
    sendRef.current = session.send;
    resizeRef.current = session.resize;
  }, [session.send, session.resize]);

  useEffect(() => {
    if (!tab.started) return;
    if (session.connected) {
      onStatusChange(tab.sessionId, 'connected');
    } else if (!session.connected && session.error) {
      onStatusChange(tab.sessionId, 'error', session.error);
    }
  }, [onStatusChange, session.connected, session.error, session.ready, tab.sessionId, tab.started]);

  useEffect(() => {
    if (!tab.started || !containerRef.current) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const init = async (): Promise<void> => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 13,
        scrollback: 8000,
        allowProposedApi: true,
        theme: {
          background: cssVar('--background', '#020617'),
          foreground: cssVar('--foreground', '#f8fafc'),
          cursor: cssVar('--primary', '#6366f1'),
          selectionBackground: `${cssVar('--primary', '#6366f1')}40`,
          black: cssVar('--background', '#020617'),
          red: cssVar('--destructive', '#ef4444'),
          green: cssVar('--success', '#22c55e'),
          yellow: cssVar('--warning', '#eab308'),
          blue: cssVar('--primary', '#6366f1'),
          magenta: cssVar('--accent', '#334155'),
          cyan: cssVar('--primary', '#6366f1'),
          white: cssVar('--foreground', '#f8fafc'),
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      term.focus();
      term.onData((data) => sendRef.current(data));
      term.onResize(({ cols, rows }) => resizeRef.current(cols, rows));

      termRef.current = term;
      fitRef.current = fit;

      const fitSoon = (): void => {
        requestAnimationFrame(() => fit.fit());
      };
      const resizeObserver = new ResizeObserver(fitSoon);
      resizeObserver.observe(containerRef.current);
      window.addEventListener('resize', fitSoon);

      cleanup = () => {
        window.removeEventListener('resize', fitSoon);
        resizeObserver.disconnect();
        term.dispose();
        if (termRef.current === term) termRef.current = null;
        if (fitRef.current === fit) fitRef.current = null;
      };
    };

    init().catch(() => onStatusChange(tab.sessionId, 'error'));

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [onStatusChange, tab.sessionId, tab.started]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        termRef.current?.focus();
      });
    }
  }, [active]);

  useEffect(() => {
    if (!commandRequest || commandRequest.sessionId !== tab.sessionId) return;
    if (sentCommandRequestRef.current === commandRequest.id) return;
    sentCommandRequestRef.current = commandRequest.id;
    sendRef.current(commandRequest.command);
    termRef.current?.focus();
  }, [commandRequest, tab.sessionId]);

  useEffect(() => {
    if (!actionRequest || actionRequest.sessionId !== tab.sessionId) return;
    if (handledActionRequestRef.current === actionRequest.id) return;
    handledActionRequestRef.current = actionRequest.id;

    if (actionRequest.action === 'clear') {
      termRef.current?.clear();
      termRef.current?.focus();
      return;
    }
    if (actionRequest.action === 'focus') {
      termRef.current?.focus();
      return;
    }
    const selection = termRef.current?.getSelection();
    if (!selection) {
      onNotice('No terminal selection to copy', 'warning');
      return;
    }
    navigator.clipboard
      ?.writeText(selection)
      .then(() => onNotice('Selection copied', 'success'))
      .catch(() => onNotice('Unable to copy selection', 'destructive'));
  }, [actionRequest, onNotice, tab.sessionId]);

  if (!tab.started) return null;

  return (
    <div
      ref={containerRef}
      data-testid="fleet-terminal-container"
      className="h-full w-full overflow-hidden p-2"
      style={{ backgroundColor: 'var(--background)' }}
    />
  );
}
