'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, Clock, Terminal, CheckCircle2, XCircle, AlertCircle, LoaderCircle, History, ChevronRight, ArrowLeft, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UpdateRunStatus } from '@/types/updates';
import { cn } from '@/lib/utils';

interface UpdateHistoryModalProps {
    onClose: () => void;
}

export default function UpdateHistoryModal({ onClose }: UpdateHistoryModalProps) {
    const [runs, setRuns] = useState<UpdateRunStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRun, setSelectedRun] = useState<UpdateRunStatus | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const logContainerRef = useRef<HTMLPreElement | null>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    async function loadRuns() {
        setLoading(true);
        try {
            const res = await fetch('/api/system/update/history');
            if (res.ok) {
                const data = await res.json();
                setRuns(data);
            }
        } finally {
            setLoading(false);
        }
    }

    async function loadDetails(runId: string, isSilent = false) {
        if (!isSilent) setDetailsLoading(true);
        try {
            const res = await fetch(`/api/system/update/history/${runId}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedRun(data);
            }
        } finally {
            if (!isSilent) setDetailsLoading(false);
        }
    }

    useEffect(() => {
        loadRuns();
        return () => {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        };
    }, []);

    useEffect(() => {
        if (selectedRun?.status === 'running') {
            if (!pollingIntervalRef.current) {
                pollingIntervalRef.current = setInterval(() => {
                    loadDetails(selectedRun.runId, true);
                }, 2000);
            }
        } else {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        }
    }, [selectedRun?.status, selectedRun?.runId]);

    useEffect(() => {
        if (autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [selectedRun?.logContent, autoScroll]);

    const StatusIcon = ({ status }: { status: UpdateRunStatus['status'] }) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="w-5 h-5 text-success" />;
            case 'failed': return <XCircle className="w-5 h-5 text-destructive" />;
            case 'running': return <LoaderCircle className="w-5 h-5 text-warning animate-spin" />;
            default: return <AlertCircle className="w-5 h-5 text-muted-foreground" />;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="absolute inset-0 bg-background/40 backdrop-blur-md transition-all duration-500" onClick={onClose} />
            
            <div className="relative w-full max-w-4xl h-[85vh] flex flex-col rounded-[2.5rem] border border-white/10 bg-card/60 backdrop-blur-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                {/* Header */}
                <div className="flex items-center justify-between p-6 sm:px-8 border-b border-white/5 bg-white/5 shrink-0">
                    <div className="flex items-center gap-5">
                        {selectedRun && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setSelectedRun(null)}
                                className="h-10 w-10 p-0 rounded-2xl hover:bg-white/10 transition-all active:scale-90"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        )}
                        <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 shadow-[0_0_20px_rgba(var(--primary),0.1)]">
                            <History className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight sm:text-2xl">
                                {selectedRun ? 'Update Log' : 'Update History'}
                            </h2>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-black opacity-50">
                                {selectedRun ? `RUN ID: ${selectedRun.runId}` : 'System Maintenance'}
                            </p>
                        </div>
                    </div>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={onClose} 
                        className="h-10 w-10 p-0 rounded-2xl border border-white/5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-all active:scale-90"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
                    {selectedRun ? (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="p-4 sm:px-6 border-b border-white/5 bg-white/[0.02] flex flex-wrap items-center justify-between gap-4 shrink-0">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2.5">
                                        <Clock className="w-4 h-4 text-muted-foreground opacity-50" />
                                        <span className="text-[13px] text-foreground/80 font-bold font-mono">
                                            {new Date(selectedRun.startedAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge 
                                            variant={selectedRun.status === 'completed' ? 'success' : selectedRun.status === 'running' ? 'warning' : 'destructive'}
                                            className={cn(
                                                "h-6 text-[10px] px-3 rounded-full font-black uppercase tracking-widest border-0 shadow-lg",
                                                selectedRun.status === 'running' && "animate-pulse shadow-[0_0_15px_rgba(var(--warning),0.4)]"
                                            )}
                                        >
                                            {selectedRun.status}
                                        </Badge>
                                        {selectedRun.status === 'running' && (
                                            <div className="flex items-center gap-2 px-3 h-6 rounded-full bg-primary/10 border border-primary/30 shadow-[0_0_12px_rgba(var(--primary),0.2)]">
                                                <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                                                <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em]">Live</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 ml-auto">
                                    <button
                                        onClick={() => setAutoScroll(!autoScroll)}
                                        className={cn(
                                            "flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                                            autoScroll 
                                                ? "bg-primary/10 text-primary border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.15)]" 
                                                : "bg-muted/50 text-muted-foreground border-white/5 hover:bg-muted"
                                        )}
                                    >
                                        <RotateCcw className={cn("w-4 h-4 transition-transform duration-700", autoScroll && "animate-spin-slow")} />
                                        Auto-Scroll {autoScroll ? 'ON' : 'OFF'}
                                    </button>
                                    {selectedRun.exitCode !== null && (
                                        <span className="text-[11px] font-mono font-black text-muted-foreground bg-white/5 p-1.5 px-3 rounded-xl border border-white/5 uppercase tracking-tighter">
                                            Exit {selectedRun.exitCode}
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex-1 bg-[#050505]/60 relative min-h-0">
                                {detailsLoading ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-5">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full animate-pulse" />
                                            <LoaderCircle className="w-12 h-12 animate-spin text-primary relative z-10" />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground/30 animate-pulse">Synchronizing Logs</span>
                                    </div>
                                ) : (
                                    <pre 
                                        ref={logContainerRef}
                                        className="p-6 sm:p-8 h-full font-mono text-[13px] leading-[1.8] text-zinc-400 whitespace-pre-wrap break-all focus:outline-none overflow-y-auto custom-scrollbar selection:bg-primary/40 scroll-smooth"
                                    >
                                        {selectedRun.logContent || 'No log output available for this run.'}
                                        {selectedRun.status === 'running' && (
                                            <div className="mt-6 flex items-center gap-4 text-warning/80 font-black animate-pulse bg-warning/5 p-4 rounded-2xl border border-warning/10 max-w-fit shadow-lg shadow-warning/5">
                                                <Terminal className="w-5 h-5" />
                                                <span className="tracking-[0.2em] uppercase text-[11px]">Executing update process...</span>
                                            </div>
                                        )}
                                    </pre>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-40 gap-5">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full animate-pulse" />
                                        <LoaderCircle className="w-14 h-14 animate-spin text-primary/30 relative z-10" />
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-[0.4em] text-muted-foreground/30">Analyzing History</span>
                                </div>
                            ) : runs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-40 px-10 text-center animate-in fade-in zoom-in-95 duration-700">
                                    <div className="w-28 h-28 rounded-[2rem] bg-white/5 flex items-center justify-center mb-8 relative group transition-all duration-500 hover:scale-110">
                                        <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full transition-all group-hover:bg-primary/20" />
                                        <History className="w-12 h-12 text-muted-foreground/20 relative z-10 transition-colors group-hover:text-primary/40" />
                                    </div>
                                    <h3 className="text-xl font-bold text-foreground tracking-tight">No Records Found</h3>
                                    <p className="text-sm text-muted-foreground mt-3 max-w-[320px] leading-[1.6]">
                                        Your update logs are empty. New installation artifacts will appear here after successfull update runs.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {runs.map((run, index) => (
                                        <button
                                            key={run.runId}
                                            onClick={() => loadDetails(run.runId)}
                                            style={{ animationDelay: `${index * 50}ms` }}
                                            className="w-full flex items-center justify-between p-6 sm:px-8 rounded-[2.5rem] bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 transition-all group relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 active:scale-[0.98]"
                                        >
                                            <div className="flex items-center gap-6 sm:gap-8 relative z-10">
                                                <div className={cn(
                                                    "w-14 h-14 rounded-[1.25rem] flex items-center justify-center shrink-0 border transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-xl",
                                                    run.status === 'completed' ? "bg-success/10 border-success/20 shadow-success/10" : 
                                                    run.status === 'running' ? "bg-warning/10 border-warning/20 shadow-warning/10" : 
                                                    "bg-destructive/10 border-destructive/20 shadow-destructive/10"
                                                )}>
                                                    <StatusIcon status={run.status} />
                                                </div>
                                                <div className="text-left">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-lg font-bold text-foreground tracking-tight">
                                                            System Update
                                                        </span>
                                                        <Badge variant="outline" className="text-[10px] font-mono font-bold h-5 px-3 bg-black/40 border-white/5 text-muted-foreground/60 rounded-lg">
                                                            #{run.runId.slice(-8)}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2.5 text-xs text-muted-foreground/60 font-semibold tracking-wide">
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="w-4 h-4 opacity-40 text-primary" />
                                                            {new Date(run.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                            <span className="opacity-30">•</span>
                                                            {new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                        {run.finishedAt && (
                                                            <>
                                                                <div className="flex items-center gap-2 text-primary/70">
                                                                    <LoaderCircle className="w-4 h-4" />
                                                                    <span className="font-black uppercase text-[10px] tracking-[0.1em]">
                                                                        Duration: {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                                                                    </span>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-primary/10 p-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 relative z-10 shadow-2xl shadow-primary/30 border border-primary/20">
                                                <ChevronRight className="w-6 h-6 text-primary" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!selectedRun && !loading && runs.length > 0 && (
                    <div className="p-6 border-t border-white/5 bg-white/5 flex justify-center shrink-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/20">
                            Archived Installation Records ({runs.length})
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
