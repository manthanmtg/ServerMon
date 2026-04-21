'use client';

import { memo } from 'react';
import type { AgentSession } from '../../types';
import { useAutoScroll } from '../useAutoScroll';
import { relativeTime } from '../utils';
import { EmptyState } from './EmptyState';

interface Props {
  timeline: AgentSession['timeline'];
  autoScroll: boolean;
}

function TimelinePanelInner({ timeline, autoScroll }: Props) {
  const scrollRef = useAutoScroll([timeline], autoScroll);

  if (timeline.length === 0) {
    return <EmptyState label="No activity recorded in timeline" />;
  }

  return (
    <div ref={scrollRef} className="space-y-4 max-h-[400px] overflow-y-auto pr-1 scroll-smooth">
      <div className="relative ml-2 pl-6 border-l-2 border-primary/20 space-y-6 py-2">
        {timeline.map((entry, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-background bg-primary shadow-sm" />
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{entry.action}</span>
                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                  {relativeTime(entry.timestamp)}
                </span>
              </div>
              {entry.detail && (
                <div className="p-2 rounded bg-muted/40 text-[10px] font-mono whitespace-pre-wrap break-all border border-border/40">
                  {entry.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const TimelinePanel = memo(TimelinePanelInner);
