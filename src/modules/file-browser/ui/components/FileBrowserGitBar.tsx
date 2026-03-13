'use client';

import React from 'react';
import { GitBranch, GitCommit, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface GitInfo {
    root: string;
    branch: string;
    dirty: boolean;
    changedFiles: number;
}

interface Props {
    git: GitInfo;
}

export function FileBrowserGitBar({ git }: Props) {
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/40 bg-background/50 backdrop-blur-sm px-5 py-3.5 text-xs shadow-sm ring-1 ring-border/5">
            <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
                    <GitBranch className="w-4 h-4" />
                </div>
                <div>
                    <p className="font-semibold text-foreground leading-none">{git.branch}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate max-w-[200px]" title={git.root}>
                        {git.root}
                    </p>
                </div>
            </div>

            <div className="h-4 w-px bg-border hidden sm:block" />

            <div className="flex items-center gap-2">
                <Badge 
                    variant={git.dirty ? 'warning' : 'success'} 
                    className="h-6 px-2 gap-1.5 font-medium"
                >
                    <div className={cn(
                        "w-1.5 h-1.5 rounded-full animate-pulse",
                        git.dirty ? "bg-warning-foreground" : "bg-success-foreground"
                    )} />
                    {git.dirty ? `${git.changedFiles} changes` : 'Clean'}
                </Badge>
            </div>

            <div className="ml-auto flex items-center gap-2">
                <button className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 py-1.5 font-bold text-[10px] uppercase tracking-wider text-muted-foreground transition-all hover:bg-accent hover:text-foreground hover:shadow-sm active:scale-95">
                    <RefreshCcw className="w-3.5 h-3.5" />
                    Fetch
                </button>
                <button className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 font-bold text-[10px] uppercase tracking-wider text-primary-foreground transition-all hover:opacity-90 hover:shadow-md active:scale-95">
                    <GitCommit className="w-3.5 h-3.5" />
                    Commit
                </button>
            </div>
        </div>
    );
}
