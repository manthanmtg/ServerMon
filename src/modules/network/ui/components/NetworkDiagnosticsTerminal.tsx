'use client';

import { TerminalSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import TerminalUI from '@/modules/terminal/ui/TerminalUI';

interface NetworkDiagnosticsTerminalProps {
  sessionId: string;
  command: string;
  onCommandChange: (command: string) => void;
}

const quickCommands: Array<{ label: string; command: string }> = [
  { label: 'ip addr', command: 'ip addr\n' },
  { label: 'netstat', command: 'netstat -tpln\n' },
  { label: 'ping', command: 'ping -c 4 8.8.8.8\n' },
  { label: 'mtr', command: 'mtr --report google.com\n' },
];

export function NetworkDiagnosticsTerminal({
  sessionId,
  command,
  onCommandChange,
}: NetworkDiagnosticsTerminalProps) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Network Diagnostics Terminal</CardTitle>
            <p className="text-sm text-muted-foreground">
              Run native network tools for deep packet analysis and troubleshooting.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickCommands.map((item) => (
              <Button
                key={item.label}
                size="sm"
                variant="outline"
                onClick={() => onCommandChange(item.command)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-border/60 bg-background/80 overflow-hidden shadow-inner">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 bg-muted/20">
            <TerminalSquare className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Active Shell Session
            </span>
            <div className="ml-auto flex gap-1">
              <div className="w-2 h-2 rounded-full bg-destructive/40" />
              <div className="w-2 h-2 rounded-full bg-warning/40" />
              <div className="w-2 h-2 rounded-full bg-success/40" />
            </div>
          </div>
          <div className="h-[400px]">
            <TerminalUI sessionId={sessionId} initialCommand={command} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
