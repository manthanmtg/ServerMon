'use client';

import React, { useState, useCallback, FormEvent } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Check,
    ChevronDown,
    CircleDot,
    FileText,
    GitBranch,
    GitCommit,
    LoaderCircle,
    Minus,
    Plus,
    RefreshCcw,
    RotateCcw,
    Undo2,
    X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface GitFileStatus {
    path: string;
    status: string;
    staged: boolean;
}

interface GitInfo {
    root: string;
    branch: string;
    dirty: boolean;
    changedFiles: number;
    staged: GitFileStatus[];
    unstaged: GitFileStatus[];
    untracked: GitFileStatus[];
    branches: string[];
    remotes: string[];
    ahead: number;
    behind: number;
}

interface Props {
    git: GitInfo;
    onRefresh: () => void;
}

type PanelTab = 'status' | null;

const STATUS_COLORS: Record<string, string> = {
    modified: 'text-warning',
    added: 'text-success',
    deleted: 'text-destructive',
    renamed: 'text-primary',
    untracked: 'text-muted-foreground',
    copied: 'text-primary',
    unmerged: 'text-destructive',
};

const STATUS_LETTERS: Record<string, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    untracked: '?',
    copied: 'C',
    unmerged: 'U',
};

async function gitAction(root: string, action: string, extra: Record<string, string> = {}): Promise<string> {
    const res = await fetch('/api/modules/file-browser/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root, action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Git operation failed');
    return data.result || '';
}

export function FileBrowserGitBar({ git, onRefresh }: Props) {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<PanelTab>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [showBranches, setShowBranches] = useState(false);
    const [showCommit, setShowCommit] = useState(false);
    const [commitMsg, setCommitMsg] = useState('');

    const doAction = useCallback(async (action: string, extra: Record<string, string> = {}, label?: string) => {
        setBusy(action);
        try {
            const result = await gitAction(git.root, action, extra);
            toast({ title: label || action, description: result || 'Done', variant: 'success' });
            onRefresh();
        } catch (error) {
            toast({ title: `${action} failed`, description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
        } finally {
            setBusy(null);
        }
    }, [git.root, onRefresh, toast]);

    const handleCommit = async (e: FormEvent) => {
        e.preventDefault();
        if (!commitMsg.trim()) return;
        await doAction('commit', { message: commitMsg.trim() }, 'Committed');
        setCommitMsg('');
        setShowCommit(false);
    };

    const toggleTab = (tab: PanelTab) => setActiveTab(prev => prev === tab ? null : tab);

    const totalChanged = git.staged.length + git.unstaged.length + git.untracked.length;

    return (
        <div className="rounded-2xl border border-border/40 bg-background/50 backdrop-blur-sm shadow-sm ring-1 ring-border/5 overflow-hidden">
            {/* Main bar */}
            <div className="flex items-center gap-2 sm:gap-3 px-4 py-3 text-xs">
                {/* Branch with switcher */}
                <div className="relative min-w-0">
                    <button
                        type="button"
                        onClick={() => setShowBranches(!showBranches)}
                        className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/80 px-3 py-1.5 transition-all hover:bg-accent hover:border-border active:scale-95 min-w-0 max-w-full"
                    >
                        <GitBranch className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-semibold text-foreground truncate" title={git.branch}>{git.branch}</span>
                        <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", showBranches && "rotate-180")} />
                    </button>

                    {showBranches && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowBranches(false)} />
                            <div className="absolute left-0 top-full mt-1 z-50 w-56 max-h-64 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
                                <div className="p-1.5">
                                    <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Local</p>
                                    {git.branches.map(b => (
                                        <button
                                            key={b}
                                            type="button"
                                            disabled={b === git.branch || busy === 'checkout'}
                                            onClick={async () => {
                                                setShowBranches(false);
                                                await doAction('checkout', { branch: b }, `Switched to ${b}`);
                                            }}
                                            className={cn(
                                                "flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                                                b === git.branch
                                                    ? "bg-primary/10 text-primary font-semibold"
                                                    : "hover:bg-accent text-foreground"
                                            )}
                                        >
                                            {b === git.branch && <Check className="w-3 h-3" />}
                                            <span className={cn("truncate", b !== git.branch && "ml-5")}>{b}</span>
                                        </button>
                                    ))}
                                    {git.remotes.length > 0 && (
                                        <>
                                            <div className="my-1 h-px bg-border" />
                                            <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Remote</p>
                                            {git.remotes.map(b => (
                                                <button
                                                    key={b}
                                                    type="button"
                                                    onClick={async () => {
                                                        setShowBranches(false);
                                                        const localName = b.split('/').slice(1).join('/');
                                                        await doAction('checkout', { branch: localName }, `Switched to ${localName}`);
                                                    }}
                                                    className="flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-left hover:bg-accent text-muted-foreground transition-colors"
                                                >
                                                    <span className="ml-5 truncate text-[11px]">{b}</span>
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="h-4 w-px bg-border hidden lg:block shrink-0" />

                {/* Status badge — clickable to expand */}
                <button
                    type="button"
                    onClick={() => toggleTab('status')}
                    className="flex items-center gap-1.5 transition-all hover:opacity-80 active:scale-95 shrink-0"
                >
                    <Badge
                        variant={git.dirty ? 'warning' : 'success'}
                        className="h-6 px-2 gap-1.5 font-medium cursor-pointer"
                    >
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            git.dirty ? "bg-warning-foreground animate-pulse" : "bg-success-foreground"
                        )} />
                        {git.dirty ? `${totalChanged} change${totalChanged !== 1 ? 's' : ''}` : 'Clean'}
                    </Badge>
                    {activeTab === 'status' && <ChevronDown className="w-3 h-3 text-muted-foreground rotate-180" />}
                </button>

                {/* Ahead/Behind */}
                {(git.ahead > 0 || git.behind > 0) && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                        {git.ahead > 0 && (
                            <span className="flex items-center gap-0.5 text-success">
                                <ArrowUp className="w-3 h-3" />{git.ahead}
                            </span>
                        )}
                        {git.behind > 0 && (
                            <span className="flex items-center gap-0.5 text-warning">
                                <ArrowDown className="w-3 h-3" />{git.behind}
                            </span>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    {git.dirty && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[10px] font-bold uppercase tracking-wider text-destructive hover:bg-destructive/10"
                            disabled={busy === 'discard-all'}
                            onClick={() => doAction('discard-all', {}, 'Discarded all changes')}
                            title="Discard all changes"
                        >
                            {busy === 'discard-all' ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                            <span className="hidden sm:inline ml-1">Reset</span>
                        </Button>
                    )}
                    <button
                        type="button"
                        disabled={busy === 'fetch'}
                        onClick={() => doAction('fetch', {}, 'Fetched')}
                        className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 py-1.5 font-bold text-[10px] uppercase tracking-wider text-muted-foreground transition-all hover:bg-accent hover:text-foreground hover:shadow-sm active:scale-95 disabled:opacity-50"
                    >
                        {busy === 'fetch' ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                        Fetch
                    </button>
                    {git.behind > 0 && (
                        <button
                            type="button"
                            disabled={busy === 'pull'}
                            onClick={() => doAction('pull', {}, 'Pulled')}
                            className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 py-1.5 font-bold text-[10px] uppercase tracking-wider text-muted-foreground transition-all hover:bg-accent hover:text-foreground hover:shadow-sm active:scale-95 disabled:opacity-50"
                        >
                            {busy === 'pull' ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <ArrowDown className="w-3.5 h-3.5" />}
                            Pull
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={git.staged.length === 0}
                        onClick={() => setShowCommit(!showCommit)}
                        className={cn(
                            "flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40",
                            git.staged.length > 0
                                ? "bg-primary text-primary-foreground hover:opacity-90 hover:shadow-md"
                                : "bg-muted text-muted-foreground"
                        )}
                    >
                        <GitCommit className="w-3.5 h-3.5" />
                        Commit
                        {git.staged.length > 0 && (
                            <span className="bg-primary-foreground/20 rounded-md px-1 text-[9px]">{git.staged.length}</span>
                        )}
                    </button>
                </div>
            </div>

            {/* Commit message bar */}
            {showCommit && git.staged.length > 0 && (
                <form onSubmit={handleCommit} className="flex items-center gap-2 px-4 pb-3 animate-in fade-in slide-in-from-top-1 duration-150">
                    <GitCommit className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        value={commitMsg}
                        onChange={(e) => setCommitMsg(e.target.value)}
                        placeholder="Commit message..."
                        className="flex-1 h-8 rounded-lg border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                    />
                    <Button type="submit" size="sm" className="h-8 px-3 text-[10px]" disabled={!commitMsg.trim() || busy === 'commit'}>
                        {busy === 'commit' ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span className="ml-1">Commit</span>
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowCommit(false)}>
                        <X className="w-3.5 h-3.5" />
                    </Button>
                </form>
            )}

            {/* Expandable status panel */}
            {activeTab === 'status' && git.dirty && (
                <div className="border-t border-border/30 animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Staged files */}
                    {git.staged.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between px-4 py-2 bg-success/5">
                                <div className="flex items-center gap-2">
                                    <CircleDot className="w-3 h-3 text-success" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-success">
                                        Staged ({git.staged.length})
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => doAction('unstage-all', {}, 'Unstaged all')}
                                    disabled={busy === 'unstage-all'}
                                    className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Unstage All
                                </button>
                            </div>
                            <div className="max-h-32 overflow-y-auto">
                                {git.staged.map(f => (
                                    <FileStatusRow
                                        key={`s-${f.path}`}
                                        file={f}
                                        actions={[
                                            { icon: <Minus className="w-3 h-3" />, title: 'Unstage', onClick: () => doAction('unstage', { path: f.path }, `Unstaged ${f.path}`) },
                                        ]}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unstaged files */}
                    {git.unstaged.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between px-4 py-2 bg-warning/5">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-3 h-3 text-warning" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-warning">
                                        Modified ({git.unstaged.length})
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => doAction('stage-all', {}, 'Staged all')}
                                        disabled={busy === 'stage-all'}
                                        className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Stage All
                                    </button>
                                </div>
                            </div>
                            <div className="max-h-32 overflow-y-auto">
                                {git.unstaged.map(f => (
                                    <FileStatusRow
                                        key={`u-${f.path}`}
                                        file={f}
                                        actions={[
                                            { icon: <Plus className="w-3 h-3" />, title: 'Stage', onClick: () => doAction('stage', { path: f.path }, `Staged ${f.path}`) },
                                            { icon: <Undo2 className="w-3 h-3" />, title: 'Discard', onClick: () => doAction('discard', { path: f.path }, `Discarded ${f.path}`), destructive: true },
                                        ]}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Untracked files */}
                    {git.untracked.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        Untracked ({git.untracked.length})
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => doAction('stage-all', {}, 'Staged all')}
                                    disabled={busy === 'stage-all'}
                                    className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Stage All
                                </button>
                            </div>
                            <div className="max-h-32 overflow-y-auto">
                                {git.untracked.map(f => (
                                    <FileStatusRow
                                        key={`?-${f.path}`}
                                        file={f}
                                        actions={[
                                            { icon: <Plus className="w-3 h-3" />, title: 'Stage', onClick: () => doAction('stage', { path: f.path }, `Staged ${f.path}`) },
                                        ]}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface FileAction {
    icon: React.ReactNode;
    title: string;
    onClick: () => void;
    destructive?: boolean;
}

function FileStatusRow({ file, actions }: { file: GitFileStatus; actions: FileAction[] }) {
    const colorClass = STATUS_COLORS[file.status] || 'text-foreground';
    const letter = STATUS_LETTERS[file.status] || file.status[0]?.toUpperCase() || '?';

    return (
        <div className="flex items-center gap-2 px-4 py-1.5 hover:bg-accent/50 transition-colors group text-xs">
            <span className={cn("font-mono font-bold w-4 text-center text-[10px]", colorClass)}>{letter}</span>
            <span className="truncate flex-1 text-foreground/80" title={file.path}>{file.path}</span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {actions.map((a, i) => (
                    <button
                        key={i}
                        type="button"
                        title={a.title}
                        onClick={a.onClick}
                        className={cn(
                            "p-1 rounded-md transition-colors",
                            a.destructive
                                ? "hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                                : "hover:bg-primary/10 hover:text-primary text-muted-foreground"
                        )}
                    >
                        {a.icon}
                    </button>
                ))}
            </div>
        </div>
    );
}
