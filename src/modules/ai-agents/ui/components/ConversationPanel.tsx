'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { AgentSession } from '../../types';
import { useAutoScroll } from '../useAutoScroll';
import { relativeTime } from '../utils';
import { EmptyState } from './EmptyState';

interface Props {
  conversation: AgentSession['conversation'];
  autoScroll: boolean;
}

function ConversationPanelInner({ conversation, autoScroll }: Props) {
  const scrollRef = useAutoScroll([conversation], autoScroll);

  if (conversation.length === 0) {
    return <EmptyState label="No conversation data available" />;
  }

  return (
    <div ref={scrollRef} className="space-y-2 max-h-[400px] overflow-y-auto scroll-smooth pr-1">
      {conversation.map((entry, i) => (
        <div
          key={i}
          className={cn(
            'rounded-lg px-3 py-2 text-xs',
            entry.role === 'user'
              ? 'bg-primary/5 border border-primary/10'
              : entry.role === 'system'
              ? 'bg-muted/30 border border-muted-foreground/10 italic'
              : 'bg-secondary/50'
          )}
        >
          <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1">
            {entry.role} &middot; {relativeTime(entry.timestamp)}
          </p>
          <p className="whitespace-pre-wrap">{entry.content}</p>
          {entry.thoughts && entry.thoughts.length > 0 && (
            <div className="mt-2 space-y-1 pt-2 border-t border-border/20">
              {entry.thoughts.map((thought, j) => (
                <div key={j} className="text-[10px] text-muted-foreground">
                  <span className="font-semibold text-primary/70">{thought.subject}:</span>{' '}
                  {thought.description}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export const ConversationPanel = memo(ConversationPanelInner);
