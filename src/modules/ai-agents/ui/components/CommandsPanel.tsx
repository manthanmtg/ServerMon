'use client';

import { memo } from 'react';
import { Terminal } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface Props {
  commands: string[];
}

function CommandsPanelInner({ commands }: Props) {
  if (commands.length === 0) {
    return <EmptyState label="No commands executed in this session" />;
  }
  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {commands.map((cmd, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/30 text-xs"
        >
          <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
          <code className="font-mono truncate">{cmd}</code>
        </div>
      ))}
    </div>
  );
}

export const CommandsPanel = memo(CommandsPanelInner);
