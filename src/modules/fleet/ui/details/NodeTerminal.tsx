'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Terminal as XtermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Terminal as TerminalIcon } from 'lucide-react';
import { useTtySession } from '@/modules/fleet/ui/lib/useTtySession';

interface NodeTerminalProps {
  nodeId: string;
}

export function NodeTerminal({ nodeId }: NodeTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XtermTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [started, setStarted] = useState(false);
  const [sessionId] = useState(() => `fleet-${nodeId}-${Date.now().toString(36)}`);

  const session = useTtySession({
    nodeId,
    sessionId,
    enabled: started,
    onData: (d) => termRef.current?.write(d),
    onExit: (info) => {
      termRef.current?.writeln(
        `\r\n\u001b[33m[session ended: code=${info.exitCode} signal=${info.signal}]\u001b[0m`
      );
    },
    onError: (m) => {
      termRef.current?.writeln(`\r\n\u001b[31m[error: ${m}]\u001b[0m`);
    },
  });

  // Init xterm on start
  useEffect(() => {
    if (!started || !containerRef.current) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      if (disposed || !containerRef.current) return;
      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 13,
        theme: { background: '#0a0a0a' },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();
      term.onData((d) => session.send(d));
      term.onResize(({ cols, rows }) => session.resize(cols, rows));
      termRef.current = term;
      fitRef.current = fit;
      const handleResize = (): void => fit.fit();
      window.addEventListener('resize', handleResize);
      cleanup = () => {
        window.removeEventListener('resize', handleResize);
        term.dispose();
        if (termRef.current === term) termRef.current = null;
        if (fitRef.current === fit) fitRef.current = null;
      };
    })().catch((err) => {
      console.error('Failed to init xterm', err);
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [started, session]);

  const toggle = useCallback(() => setStarted((s) => !s), []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4" />
          <CardTitle>Terminal</CardTitle>
          {started &&
            (session.connected ? (
              <span className="text-xs text-[color:var(--success,#16a34a)]">● connected</span>
            ) : session.error ? (
              <span className="text-xs text-destructive">● {session.error}</span>
            ) : (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Spinner size="sm" className="h-3 w-3" /> connecting
              </span>
            ))}
        </div>
        <Button size="sm" variant={started ? 'outline' : 'default'} onClick={toggle}>
          {started ? 'End session' : 'Start session'}
        </Button>
      </CardHeader>
      <CardContent>
        {!started ? (
          <div className="rounded-lg border border-border bg-black/80 text-muted-foreground font-mono text-sm p-4 h-96 flex items-center justify-center">
            Click &quot;Start session&quot; to open an interactive shell on node {nodeId}.
          </div>
        ) : (
          <div
            ref={containerRef}
            data-testid="fleet-terminal-container"
            className="rounded-lg border border-border bg-black/80 h-96 overflow-hidden"
          />
        )}
      </CardContent>
    </Card>
  );
}

export default NodeTerminal;
