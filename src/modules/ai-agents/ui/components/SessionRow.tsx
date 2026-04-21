'use client';

import { memo } from 'react';
import { FolderGit2, GitBranch, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AgentSession } from '../../types';
import { agentIcons, statusBg, statusColors } from '../constants';
import { formatDuration, relativeTime, statusVariant } from '../utils';

interface Props {
  session: AgentSession;
  onClick: (id: string) => void;
}

function SessionRowInner({ session, onClick }: Props) {
  return (
    <button
      onClick={() => onClick(session.id)}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border/60 bg-card hover:bg-accent/50 transition-colors text-left cursor-pointer min-h-[44px]"
    >
      <div
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
          statusBg[session.status],
          statusColors[session.status]
        )}
      >
        {agentIcons[session.agent.type] ?? 'AI'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{session.agent.displayName}</span>
          {session.agent.model && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {session.agent.model}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {session.environment.repository && (
            <span className="flex items-center gap-1 truncate">
              <FolderGit2 className="w-3 h-3 shrink-0" />
              {session.environment.repository}
            </span>
          )}
          {session.environment.gitBranch && (
            <span className="flex items-center gap-1 truncate">
              <GitBranch className="w-3 h-3 shrink-0" />
              {session.environment.gitBranch}
            </span>
          )}
          <span className="flex items-center gap-1">
            <User className="w-3 h-3 shrink-0" />
            {session.owner.user}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-muted-foreground">
            {formatDuration(session.lifecycle.durationSeconds)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {relativeTime(session.lifecycle.lastActivity)}
          </p>
        </div>
        <Badge variant={statusVariant(session.status)} className="text-[10px]">
          {session.status}
        </Badge>
      </div>
    </button>
  );
}

export const SessionRow = memo(SessionRowInner);
