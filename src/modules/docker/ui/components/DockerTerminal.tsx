'use client';

import { TerminalSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import TerminalUI from '@/modules/terminal/ui/TerminalUI';

interface DockerTerminalProps {
  terminalCommand: string;
  sessionId: string;
  onCommandChange: (command: string) => void;
}

export function DockerTerminal({
  terminalCommand,
  sessionId,
  onCommandChange,
}: DockerTerminalProps) {
  return (
    <Card
      className="border-border/60 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden"
      data-testid="docker-terminal"
    >
      <CardHeader className="pb-4 border-b border-border/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold tracking-tight">
              Embedded Docker terminal
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Run `docker`, `docker-compose`, and `crictl` commands without leaving the module.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 p-1 bg-muted/20 rounded-lg border border-border/20">
            <Button
              size="sm"
              variant="ghost"
              className={`h-8 px-3 text-xs font-medium rounded-md transition-all ${terminalCommand === 'docker ps -a\n' ? 'bg-card shadow-sm text-primary' : 'hover:bg-card/50'}`}
              onClick={() => onCommandChange('docker ps -a\n')}
            >
              Containers
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={`h-8 px-3 text-xs font-medium rounded-md transition-all ${terminalCommand === 'docker images\n' ? 'bg-card shadow-sm text-primary' : 'hover:bg-card/50'}`}
              onClick={() => onCommandChange('docker images\n')}
            >
              Images
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={`h-8 px-3 text-xs font-medium rounded-md transition-all ${terminalCommand === 'docker compose ps\n' ? 'bg-card shadow-sm text-primary' : 'hover:bg-card/50'}`}
              onClick={() => onCommandChange('docker compose ps\n')}
            >
              Compose
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={`h-8 px-3 text-xs font-medium rounded-md transition-all ${terminalCommand === 'crictl ps -a\n' ? 'bg-card shadow-sm text-primary' : 'hover:bg-card/50'}`}
              onClick={() => onCommandChange('crictl ps -a\n')}
            >
              CRI
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="bg-background/40 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/20 px-4 py-2.5">
            <TerminalSquare className="h-3.5 w-3.5 text-primary opacity-80" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Preset command
            </span>
            <code className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-mono text-primary shadow-sm">
              {terminalCommand.trim()}
            </code>
          </div>
          <div className="h-[360px] relative">
            <TerminalUI sessionId={sessionId} initialCommand={terminalCommand} />
            <div className="absolute inset-0 pointer-events-none border border-inset border-white/5 rounded-b-xl" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
