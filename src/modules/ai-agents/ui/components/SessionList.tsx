'use client';

import { memo } from 'react';
import { Bot, CircleDot, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AgentSession } from '../../types';
import { SessionRow } from './SessionRow';

interface Props {
  activeSessions: AgentSession[];
  pastSessions: AgentSession[];
  onSelect: (id: string) => void;
  hasFilters: boolean;
}

function SessionListInner({ activeSessions, pastSessions, onSelect, hasFilters }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2 px-1 text-success">
          <CircleDot className="w-4 h-4" />
          Active Sessions
          <Badge variant="outline" className="ml-auto text-[10px] font-normal opacity-70">
            {activeSessions.length} sessions
          </Badge>
        </h3>
        {activeSessions.length === 0 ? (
          <Card className="border-border/60 bg-transparent border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <p className="text-xs text-muted-foreground italic">
                No active sessions matching filters
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activeSessions.map((session) => (
              <SessionRow key={session.id} session={session} onClick={onSelect} />
            ))}
          </div>
        )}
      </div>

      {pastSessions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2 px-1 text-muted-foreground">
            <Clock className="w-4 h-4" />
            Past Sessions
            <Badge variant="outline" className="ml-auto text-[10px] font-normal opacity-70">
              {pastSessions.length} total
            </Badge>
          </h3>
          <div className="space-y-2">
            {pastSessions.map((session) => (
              <SessionRow key={session.id} session={session} onClick={onSelect} />
            ))}
          </div>
        </div>
      )}

      {activeSessions.length === 0 && pastSessions.length === 0 && (
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              No AI agent sessions found
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {hasFilters ? 'Try adjusting your filters' : 'Start an AI coding agent to see it here'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export const SessionList = memo(SessionListInner);
