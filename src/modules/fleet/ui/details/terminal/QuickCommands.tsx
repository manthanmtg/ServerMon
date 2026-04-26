'use client';

import { Button } from '@/components/ui/button';
import { QUICK_COMMANDS } from './types';

interface QuickCommandsProps {
  onIssueCommand: (command: string) => void;
}

export function QuickCommands({ onIssueCommand }: QuickCommandsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-secondary/10 px-3 py-2">
      {QUICK_COMMANDS.map((item) => (
        <Button
          key={item.label}
          size="sm"
          variant="ghost"
          className="shrink-0 font-mono"
          onClick={() => onIssueCommand(item.command)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
