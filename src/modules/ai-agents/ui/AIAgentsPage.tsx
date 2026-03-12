'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    Bot,
    CircleDot,
    Clock,
    Cpu,
    FileCode,
    FolderGit2,
    GitBranch,
    LoaderCircle,
    MessageSquare,
    RefreshCcw,
    Search,
    Skull,
    Square,
    Terminal,
    Timer,
    User,
    X,
    XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn, formatBytes } from '@/lib/utils';
import type { AgentSession, AgentsSnapshot, AgentType, SessionStatus } from '../types';

type FilterStatus = 'all' | SessionStatus;
type FilterAgent = 'all' | AgentType;
type DetailTab = 'conversation' | 'timeline' | 'files' | 'commands' | 'logs';

const agentIcons: Record<AgentType, string> = {
    'claude-code': 'CC',
    'codex': 'CX',
    'opencode': 'OC',
    'aider': 'AI',
    'gemini-cli': 'GC',
    'custom': '??',
};

const statusColors: Record<SessionStatus, string> = {
    running: 'text-success',
    idle: 'text-warning',
    waiting: 'text-primary',
    error: 'text-destructive',
    completed: 'text-muted-foreground',
};

const statusBg: Record<SessionStatus, string> = {
    running: 'bg-success/15',
    idle: 'bg-warning/15',
    waiting: 'bg-primary/15',
    error: 'bg-destructive/15',
    completed: 'bg-muted/30',
};

function statusVariant(status: SessionStatus): 'success' | 'warning' | 'destructive' | 'secondary' | 'default' {
    if (status === 'running') return 'success';
    if (status === 'idle') return 'warning';
    if (status === 'error') return 'destructive';
    if (status === 'waiting') return 'default';
    return 'secondary';
}

function formatDuration(seconds: number): string {
    if (seconds <= 0) return 'just started';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function relativeTime(value: string): string {
    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.max(0, Math.round(diff / 60_000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

/* ─── Summary Cards ─── */
function SummaryCards({ snapshot }: { snapshot: AgentsSnapshot | null }) {
    const s = snapshot?.summary;
    const cards = [
        { label: 'Total', value: s?.total ?? 0, icon: Bot, color: 'text-foreground' },
        { label: 'Running', value: s?.running ?? 0, icon: CircleDot, color: 'text-success' },
        { label: 'Idle', value: s?.idle ?? 0, icon: Clock, color: 'text-warning' },
        { label: 'Error', value: s?.error ?? 0, icon: XCircle, color: 'text-destructive' },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((c) => (
                <Card key={c.label} className="border-border/60">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center bg-secondary', c.color)}>
                            <c.icon className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-xl font-bold leading-none">{c.value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

/* ─── Session Row ─── */
function SessionRow({ session, onClick }: { session: AgentSession; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border/60 bg-card hover:bg-accent/50 transition-colors text-left cursor-pointer min-h-[44px]"
        >
            <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                statusBg[session.status],
                statusColors[session.status],
            )}>
                {agentIcons[session.agent.type] ?? 'AI'}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{session.agent.displayName}</span>
                    {session.agent.model && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">{session.agent.model}</Badge>
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
                    <p className="text-xs text-muted-foreground">{formatDuration(session.lifecycle.durationSeconds)}</p>
                    <p className="text-[10px] text-muted-foreground">{relativeTime(session.lifecycle.lastActivity)}</p>
                </div>
                <Badge variant={statusVariant(session.status)} className="text-[10px]">
                    {session.status}
                </Badge>
            </div>
        </button>
    );
}

/* ─── Session Detail ─── */
function SessionDetail({
    session,
    onClose,
    onTerminate,
    onKill,
    actionLoading,
}: {
    session: AgentSession;
    onClose: () => void;
    onTerminate: () => void;
    onKill: () => void;
    actionLoading: boolean;
}) {
    const [activeTab, setActiveTab] = useState<DetailTab>('conversation');

    const tabs: Array<{ id: DetailTab; label: string; icon: React.ReactNode; count?: number }> = [
        { id: 'conversation', label: 'Conversation', icon: <MessageSquare className="w-3.5 h-3.5" />, count: session.conversation.length },
        { id: 'timeline', label: 'Timeline', icon: <Timer className="w-3.5 h-3.5" />, count: session.timeline.length },
        { id: 'files', label: 'Files', icon: <FileCode className="w-3.5 h-3.5" />, count: session.filesModified.length },
        { id: 'commands', label: 'Commands', icon: <Terminal className="w-3.5 h-3.5" />, count: session.commandsExecuted.length },
        { id: 'logs', label: 'Logs', icon: <Square className="w-3.5 h-3.5" />, count: session.logs.length },
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0',
                    statusBg[session.status],
                    statusColors[session.status],
                )}>
                    {agentIcons[session.agent.type] ?? 'AI'}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold truncate">{session.agent.displayName}</h2>
                        <Badge variant={statusVariant(session.status)} className="text-[10px]">{session.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">PID {session.owner.pid} &middot; {session.owner.user}</p>
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
                        <p className="font-medium text-muted-foreground uppercase text-[10px] tracking-wider">Environment</p>
                        <div className="flex items-center gap-1.5">
                            <FolderGit2 className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{session.environment.workingDirectory}</span>
                        </div>
                        {session.environment.repository && (
                            <div className="flex items-center gap-1.5">
                                <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span>{session.environment.repository}{session.environment.gitBranch ? ` / ${session.environment.gitBranch}` : ''}</span>
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card className="border-border/60">
                    <CardContent className="p-3 space-y-1.5 text-xs">
                        <p className="font-medium text-muted-foreground uppercase text-[10px] tracking-wider">Lifecycle</p>
                        <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>Started {relativeTime(session.lifecycle.startTime)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Timer className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>Duration: {formatDuration(session.lifecycle.durationSeconds)}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border/60">
                    <CardContent className="p-3 space-y-1.5 text-xs">
                        <p className="font-medium text-muted-foreground uppercase text-[10px] tracking-wider">Resources</p>
                        <div className="flex items-center gap-1.5">
                            <Cpu className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>CPU: {session.resources.cpuPercent.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Square className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>Memory: {formatBytes(session.resources.memoryBytes)} ({session.resources.memoryPercent.toFixed(1)}%)</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Card className="border-border/60">
                <CardHeader className="pb-0 px-3 pt-3">
                    <div className="flex items-center gap-1 overflow-x-auto">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap min-h-[36px]',
                                    activeTab === tab.id
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                )}
                            >
                                {tab.icon}
                                {tab.label}
                                {(tab.count ?? 0) > 0 && (
                                    <span className={cn(
                                        'ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                        activeTab === tab.id ? 'bg-primary-foreground/20' : 'bg-secondary',
                                    )}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </CardHeader>
                <CardContent className="p-3">
                    {activeTab === 'conversation' && (
                        <ConversationPanel conversation={session.conversation} />
                    )}
                    {activeTab === 'timeline' && (
                        <TimelinePanel timeline={session.timeline} />
                    )}
                    {activeTab === 'files' && (
                        <FilesPanel files={session.filesModified} />
                    )}
                    {activeTab === 'commands' && (
                        <CommandsPanel commands={session.commandsExecuted} />
                    )}
                    {activeTab === 'logs' && (
                        <LogsPanel logs={session.logs} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

/* ─── Tab Panels ─── */
function ConversationPanel({ conversation }: { conversation: AgentSession['conversation'] }) {
    if (conversation.length === 0) {
        return <EmptyState label="No conversation data available" />;
    }
    return (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {conversation.map((entry, i) => (
                <div
                    key={i}
                    className={cn(
                        'rounded-lg px-3 py-2 text-xs',
                        entry.role === 'user' ? 'bg-primary/5 border border-primary/10' : 'bg-secondary/50',
                    )}
                >
                    <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1">
                        {entry.role} &middot; {relativeTime(entry.timestamp)}
                    </p>
                    <p className="whitespace-pre-wrap">{entry.content}</p>
                </div>
            ))}
        </div>
    );
}

function TimelinePanel({ timeline }: { timeline: AgentSession['timeline'] }) {
    if (timeline.length === 0) {
        return <EmptyState label="No timeline data available" />;
    }
    return (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {timeline.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 px-2 py-1.5 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                        <span className="font-medium">{entry.action}</span>
                        {entry.detail && <span className="text-muted-foreground ml-1">- {entry.detail}</span>}
                        <p className="text-[10px] text-muted-foreground">{relativeTime(entry.timestamp)}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function FilesPanel({ files }: { files: string[] }) {
    if (files.length === 0) {
        return <EmptyState label="No files modified in this session" />;
    }
    return (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {files.map((file, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/30 text-xs">
                    <FileCode className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-mono truncate">{file}</span>
                </div>
            ))}
        </div>
    );
}

function CommandsPanel({ commands }: { commands: string[] }) {
    if (commands.length === 0) {
        return <EmptyState label="No commands executed in this session" />;
    }
    return (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {commands.map((cmd, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/30 text-xs">
                    <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
                    <code className="font-mono truncate">{cmd}</code>
                </div>
            ))}
        </div>
    );
}

function LogsPanel({ logs }: { logs: string[] }) {
    if (logs.length === 0) {
        return <EmptyState label="No logs captured for this session" />;
    }
    return (
        <div className="max-h-[400px] overflow-y-auto rounded-md bg-secondary/30 p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                {logs.join('\n')}
            </pre>
        </div>
    );
}

function EmptyState({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-xs">
            <Bot className="w-6 h-6 mb-2 opacity-40" />
            {label}
        </div>
    );
}

/* ─── Main Page ─── */
export default function AIAgentsPage() {
    const { toast } = useToast();
    const [snapshot, setSnapshot] = useState<AgentsSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [filterAgent, setFilterAgent] = useState<FilterAgent>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const load = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        try {
            const res = await fetch('/api/modules/ai-agents', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setSnapshot(data);
            }
        } catch {
            toast({ title: 'Failed to load AI agents', variant: 'destructive' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
        const interval = window.setInterval(() => load(), 10000);
        return () => window.clearInterval(interval);
    }, [load]);

    const filteredSessions = useMemo(() => {
        let sessions = snapshot?.sessions ?? [];
        if (filterStatus !== 'all') {
            sessions = sessions.filter((s) => s.status === filterStatus);
        }
        if (filterAgent !== 'all') {
            sessions = sessions.filter((s) => s.agent.type === filterAgent);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            sessions = sessions.filter((s) =>
                s.agent.displayName.toLowerCase().includes(q) ||
                (s.environment.repository ?? '').toLowerCase().includes(q) ||
                s.owner.user.toLowerCase().includes(q) ||
                s.environment.workingDirectory.toLowerCase().includes(q)
            );
        }
        return sessions;
    }, [snapshot, filterStatus, filterAgent, search]);

    const filteredPastSessions = useMemo(() => {
        let sessions = snapshot?.pastSessions ?? [];
        if (filterAgent !== 'all') {
            sessions = sessions.filter((s) => s.agent.type === filterAgent);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            sessions = sessions.filter((s) =>
                s.agent.displayName.toLowerCase().includes(q) ||
                (s.environment.repository ?? '').toLowerCase().includes(q) ||
                s.owner.user.toLowerCase().includes(q) ||
                s.environment.workingDirectory.toLowerCase().includes(q)
            );
        }
        return sessions;
    }, [snapshot, filterAgent, search]);

    const selectedSession = useMemo(
        () => [...filteredSessions, ...filteredPastSessions].find((s) => s.id === selectedId) ?? null,
        [filteredSessions, filteredPastSessions, selectedId],
    );

    const handleTerminate = useCallback(async () => {
        if (!selectedId) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/modules/ai-agents/${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
            if (res.ok) {
                toast({ title: 'Session terminated', variant: 'success' });
                setSelectedId(null);
                load(true);
            } else {
                toast({ title: 'Failed to terminate session', variant: 'destructive' });
            }
        } catch {
            toast({ title: 'Failed to terminate session', variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    }, [selectedId, toast, load]);

    const handleKill = useCallback(async () => {
        if (!selectedId) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/modules/ai-agents/${encodeURIComponent(selectedId)}/kill`, { method: 'POST' });
            if (res.ok) {
                toast({ title: 'Session killed', variant: 'success' });
                setSelectedId(null);
                load(true);
            } else {
                toast({ title: 'Failed to kill session', variant: 'destructive' });
            }
        } catch {
            toast({ title: 'Failed to kill session', variant: 'destructive' });
        } finally {
            setActionLoading(false);
        }
    }, [selectedId, toast, load]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    if (selectedSession) {
        return (
            <SessionDetail
                session={selectedSession}
                onClose={() => setSelectedId(null)}
                onTerminate={handleTerminate}
                onKill={handleKill}
                actionLoading={actionLoading}
            />
        );
    }

    const agentTypes: AgentType[] = ['claude-code', 'codex', 'opencode', 'aider', 'gemini-cli', 'custom'];

    return (
        <div className="space-y-4">
            <SummaryCards snapshot={snapshot} />

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search agents, repos, users..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-border bg-background placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                    className="h-9 px-3 text-xs font-medium bg-secondary border border-border rounded-lg text-secondary-foreground outline-none cursor-pointer hover:bg-accent transition-colors"
                >
                    <option value="all">All Status</option>
                    <option value="running">Running</option>
                    <option value="idle">Idle</option>
                    <option value="waiting">Waiting</option>
                    <option value="error">Error</option>
                    <option value="completed">Completed</option>
                </select>

                <select
                    value={filterAgent}
                    onChange={(e) => setFilterAgent(e.target.value as FilterAgent)}
                    className="h-9 px-3 text-xs font-medium bg-secondary border border-border rounded-lg text-secondary-foreground outline-none cursor-pointer hover:bg-accent transition-colors"
                >
                    <option value="all">All Agents</option>
                    {agentTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>

                <Button variant="outline" size="sm" onClick={() => load(true)} loading={refreshing}>
                    <RefreshCcw className="w-3.5 h-3.5" />
                    Refresh
                </Button>
            </div>

            {/* Session List */}
            <div className="space-y-6">
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2 px-1 text-success">
                        <CircleDot className="w-4 h-4" />
                        Active Sessions
                        <Badge variant="outline" className="ml-auto text-[10px] font-normal opacity-70">
                            {filteredSessions.length} sessions
                        </Badge>
                    </h3>
                    {filteredSessions.length === 0 ? (
                        <Card className="border-border/60 bg-transparent border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-10">
                                <p className="text-xs text-muted-foreground italic">No active sessions matching filters</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-2">
                            {filteredSessions.map((session) => (
                                <SessionRow
                                    key={session.id}
                                    session={session}
                                    onClick={() => setSelectedId(session.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {filteredPastSessions.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2 px-1 text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            Past Sessions
                            <Badge variant="outline" className="ml-auto text-[10px] font-normal opacity-70">
                                {filteredPastSessions.length} total
                            </Badge>
                        </h3>
                        <div className="space-y-2">
                            {filteredPastSessions.map((session) => (
                                <SessionRow
                                    key={session.id}
                                    session={session}
                                    onClick={() => setSelectedId(session.id)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {filteredSessions.length === 0 && filteredPastSessions.length === 0 && (
                    <Card className="border-border/60">
                        <CardContent className="flex flex-col items-center justify-center py-16">
                            <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">No AI agent sessions found</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">
                                {search || filterStatus !== 'all' || filterAgent !== 'all'
                                    ? 'Try adjusting your filters'
                                    : 'Start an AI coding agent to see it here'}
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
