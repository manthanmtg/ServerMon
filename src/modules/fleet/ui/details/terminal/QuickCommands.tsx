'use client';

import { Button } from '@/components/ui/button';
import { QUICK_COMMANDS } from './types';

interface QuickCommandsProps {
  onIssueCommand: (command: string) => void;
}

export function QuickCommands({ onIssueCommand }: QuickCommandsProps) {
  return (
    <div className="flex snap-x items-center gap-2 overflow-x-auto border-b border-border bg-secondary/10 px-3 py-2 [scrollbar-width:thin]">
      {QUICK_COMMANDS.map((item) => (
        <Button
          key={item.label}
          size="sm"
          variant="outline"
          className="min-h-11 snap-start whitespace-nowrap bg-card/60 font-mono shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent hover:shadow-md active:translate-y-0 active:scale-[0.99]"
          onClick={() => onIssueCommand(item.command)}
          title={`Run ${item.label}`}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
