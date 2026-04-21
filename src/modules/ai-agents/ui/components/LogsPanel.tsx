'use client';

import { memo, useMemo } from 'react';
import { useAutoScroll } from '../useAutoScroll';
import { EmptyState } from './EmptyState';

interface Props {
  logs: string[];
  autoScroll: boolean;
}

function LogsPanelInner({ logs, autoScroll }: Props) {
  const scrollRef = useAutoScroll([logs], autoScroll);
  // Join once per logs reference rather than on every render of this tree.
  const joined = useMemo(() => logs.join('\n'), [logs]);

  if (logs.length === 0) {
    return <EmptyState label="No logs captured for this session" />;
  }
  return (
    <div
      ref={scrollRef}
      className="max-h-[400px] overflow-y-auto rounded-md bg-secondary/30 p-3 scroll-smooth"
    >
      <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{joined}</pre>
    </div>
  );
}

export const LogsPanel = memo(LogsPanelInner);
