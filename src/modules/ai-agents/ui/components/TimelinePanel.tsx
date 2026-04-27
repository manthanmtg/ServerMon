'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
        <AnimatePresence initial={false}>
          {timeline.map((entry, i) => (
            <motion.div
              key={`${entry.timestamp}-${i}`}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative group"
            >
              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-background bg-primary shadow-sm transition-transform duration-300 group-hover:scale-125 group-hover:shadow-[0_0_12px_hsl(var(--primary)/0.4)]" />
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold transition-colors duration-200 group-hover:text-primary">{entry.action}</span>
                  <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary">
                    {relativeTime(entry.timestamp)}
                  </span>
                </div>
                {entry.detail && (
                  <div className="p-2 rounded bg-muted/40 transition-colors duration-200 hover:bg-accent/50 text-[10px] font-mono whitespace-pre-wrap break-all border border-border/40 hover:border-primary/30">
                    {entry.detail}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export const TimelinePanel = memo(TimelinePanelInner);
