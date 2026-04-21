'use client';

import { memo, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CircleDot,
  FileCode,
  FolderGit2,
  GitBranch,
  History,
  MessageSquare,
  Skull,
  Square,
  Terminal,
  Timer,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AutoscrollButton } from '@/components/ui/AutoscrollButton';
import { cn } from '@/lib/utils';
import type { AgentSession } from '../../types';
import { agentIcons, statusBg, statusColors } from '../constants';
import { statusVariant } from '../utils';
import { ConversationPanel } from './ConversationPanel';
import { TimelinePanel } from './TimelinePanel';
import { FilesPanel } from './FilesPanel';
import { CommandsPanel } from './CommandsPanel';
import { LogsPanel } from './LogsPanel';

type DetailTab = 'conversation' | 'timeline' | 'files' | 'commands' | 'logs';

interface TabDef {
  id: DetailTab;
  label: string;
  icon: React.ReactNode;
  count: number;
  alwaysVisible?: boolean;
}

interface Props {
  session: AgentSession;
  onClose: () => void;
  onTerminate: () => void;
  onKill: () => void;
  actionLoading: boolean;
}

function SessionDetailInner({ session, onClose, onTerminate, onKill, actionLoading }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('conversation');
  const [autoScrollConv, setAutoScrollConv] = useState(true);
  const [autoScrollTimeline, setAutoScrollTimeline] = useState(true);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);

  const tabs = useMemo<TabDef[]>(() => {
    const allTabs: TabDef[] = [
      {
        id: 'conversation',
        label: 'Conversation',
        icon: <MessageSquare className="w-3.5 h-3.5" />,
        count: session.conversation.length,
        alwaysVisible: true,
      },
      {
        id: 'timeline',
        label: 'Timeline',
        icon: <Timer className="w-3.5 h-3.5" />,
        count: session.timeline.length,
      },
      {
        id: 'files',
        label: 'Files',
        icon: <FileCode className="w-3.5 h-3.5" />,
        count: session.filesModified.length,
      },
      {
        id: 'commands',
        label: 'Commands',
        icon: <Terminal className="w-3.5 h-3.5" />,
        count: session.commandsExecuted.length,
      },
      {
        id: 'logs',
        label: 'Logs',
        icon: <Square className="w-3.5 h-3.5" />,
        count: session.logs.length,
      },
    ];
    const running = session.status === 'running';
    return allTabs.filter((tab) => tab.alwaysVisible || running || tab.count > 0);
  }, [
    session.conversation.length,
    session.timeline.length,
    session.filesModified.length,
    session.commandsExecuted.length,
    session.logs.length,
    session.status,
  ]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0',
            statusBg[session.status],
            statusColors[session.status]
          )}
        >
          {agentIcons[session.agent.type] ?? 'AI'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold truncate">{session.agent.displayName}</h2>
            <Badge variant={statusVariant(session.status)} className="text-[10px]">
              {session.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {session.owner.pid > 0 ? (
              <span className="flex items-center gap-1">
                <CircleDot className="w-2.5 h-2.5 text-success animate-pulse" />
                Active PID {session.owner.pid}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <History className="w-2.5 h-2.5 opacity-60" />
                Historical Session
              </span>
            )}
            &middot; {session.owner.user}
          </p>
        </div>
        {session.status === 'running' && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onTerminate} loading={actionLoading}>
              <XCircle className="w-3.5 h-3.5" />
              Stop
            </Button>
            <Button variant="destructive" size="sm" onClick={onKill} loading={actionLoading}>
              <Skull className="w-3.5 h-3.5" />
              Kill
            </Button>
          </div>
        )}
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-3 space-y-1.5 text-xs">
            <p className="font-medium text-muted-foreground uppercase text-[10px] tracking-wider">
              Environment
            </p>
            <div className="flex items-center gap-1.5">
              <FolderGit2 className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="truncate">{session.environment.workingDirectory}</span>
            </div>
            {session.environment.repository && (
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
                <span>
                  {session.environment.repository}
                  {session.environment.gitBranch ? ` / ${session.environment.gitBranch}` : ''}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/60 overflow-hidden">
          <CardContent className="p-3 space-y-1.5 text-xs relative">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full -mr-4 -mt-4" />
            <p className="font-medium text-muted-foreground uppercase text-[10px] tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Usage Metrics
            </p>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-muted-foreground">Input Tokens</span>
              <span className="font-mono tabular-nums">
                {session.usage?.inputTokens?.toLocaleString() ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-muted-foreground">Output Tokens</span>
              <span className="font-mono tabular-nums">
                {session.usage?.outputTokens?.toLocaleString() ?? 0}
              </span>
            </div>
            <div className="pt-1 border-t border-border/40 flex items-center justify-between font-semibold">
              <span>Total</span>
              <span className="text-primary tabular-nums">
                {(session.usage?.totalTokens ?? 0).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card className="border-border/60">
        <CardHeader className="pb-0 px-3 pt-3">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap min-h-[36px]',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className={cn(
                        'ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold',
                        activeTab === tab.id ? 'bg-primary-foreground/20' : 'bg-secondary'
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {activeTab === 'conversation' && (
              <AutoscrollButton
                enabled={autoScrollConv}
                onToggle={setAutoScrollConv}
                className="h-9 px-3"
              />
            )}
            {activeTab === 'timeline' && (
              <AutoscrollButton
                enabled={autoScrollTimeline}
                onToggle={setAutoScrollTimeline}
                className="h-9 px-3"
              />
            )}
            {activeTab === 'logs' && (
              <AutoscrollButton
                enabled={autoScrollLogs}
                onToggle={setAutoScrollLogs}
                className="h-9 px-3"
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {activeTab === 'conversation' && (
            <ConversationPanel conversation={session.conversation} autoScroll={autoScrollConv} />
          )}
          {activeTab === 'timeline' && (
            <TimelinePanel timeline={session.timeline} autoScroll={autoScrollTimeline} />
          )}
          {activeTab === 'files' && <FilesPanel files={session.filesModified} />}
          {activeTab === 'commands' && <CommandsPanel commands={session.commandsExecuted} />}
          {activeTab === 'logs' && <LogsPanel logs={session.logs} autoScroll={autoScrollLogs} />}
        </CardContent>
      </Card>
    </div>
  );
}

export const SessionDetail = memo(SessionDetailInner);
