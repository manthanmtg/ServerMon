'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, Clock, Terminal, CheckCircle2, XCircle, AlertCircle, LoaderCircle, History, ChevronRight, ArrowLeft } from 'lucide-react';
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
    const logContainerRef = useRef<HTMLPreElement | null>(null);

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

    async function loadDetails(runId: string) {
        setDetailsLoading(true);
        try {
            const res = await fetch(`/api/system/update/history/${runId}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedRun(data);
            }
        } finally {
            setDetailsLoading(false);
        }
    }

    useEffect(() => {
        loadRuns();
    }, []);

    useEffect(() => {
        if (selectedRun && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [selectedRun]);

    const StatusIcon = ({ status }: { status: UpdateRunStatus['status'] }) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="w-4 h-4 text-success" />;
            case 'failed': return <XCircle className="w-4 h-4 text-destructive" />;
            case 'running': return <LoaderCircle className="w-4 h-4 text-warning animate-spin" />;
            default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-3">
                        {selectedRun && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setSelectedRun(null)}
                                className="h-11 w-11 p-0 rounded-xl"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        )}
                        <div className="p-2 rounded-lg bg-primary/10">
                            <History className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">
                                {selectedRun ? 'Update Log' : 'Update History'}
                            </h2>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
                                {selectedRun ? `Run ID: ${selectedRun.runId}` : 'System Maintenance'}
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose} className="h-11 w-11 p-0 rounded-xl border border-border/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-all">
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden min-h-0">
                    {selectedRun ? (
                        <div className="h-full flex flex-col min-h-0">
                            <div className="p-4 border-b border-border bg-muted/5 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                        <span className="text-xs text-foreground font-medium">
                                            {new Date(selectedRun.startedAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <Badge 
                                        variant={selectedRun.status === 'completed' ? 'success' : selectedRun.status === 'running' ? 'warning' : 'destructive'}
                                        className="h-5 text-[10px] px-2"
                                    >
                                        {selectedRun.status.toUpperCase()}
                                    </Badge>
                                </div>
                                {selectedRun.exitCode !== null && (
                                    <span className="text-[10px] font-mono text-muted-foreground bg-muted p-1 px-1.5 rounded">
                                        EXIT CODE: {selectedRun.exitCode}
                                    </span>
                                )}
                            </div>
                            
                            <div className="flex-1 bg-[#0a0a0a] text-zinc-300 font-mono text-[13px] leading-relaxed overflow-hidden min-h-0 selection:bg-primary/30">
                                {detailsLoading ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-3">
                                        <LoaderCircle className="w-6 h-6 animate-spin text-primary/50" />
                                        <span className="text-xs text-muted-foreground">Loading log entries...</span>
                                    </div>
                                ) : (
                                    <pre 
                                        ref={logContainerRef}
                                        className="p-4 h-full whitespace-pre-wrap break-all focus:outline-none overflow-y-auto custom-scrollbar"
                                    >
                                        {selectedRun.logContent || 'No log output available for this run.'}
                                        {selectedRun.status === 'running' && (
                                            <div className="mt-2 flex items-center gap-2 text-warning animate-pulse">
                                                <Terminal className="w-3.5 h-3.5" />
                                                <span>Update in progress...</span>
                                            </div>
                                        )}
                                    </pre>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full overflow-y-auto custom-scrollbar">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <LoaderCircle className="w-8 h-8 animate-spin text-primary/30" />
                                    <span className="text-sm font-medium text-muted-foreground">Fetching update records...</span>
                                </div>
                            ) : runs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 px-10 text-center">
                                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                                        <History className="w-8 h-8 text-muted-foreground/20" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-foreground">No History Found</h3>
                                    <p className="text-xs text-muted-foreground mt-2 max-w-[240px]">
                                        Updates performed before the logging system was implemented will not appear here.
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border/60">
                                    {runs.map((run) => (
                                        <button
                                            key={run.runId}
                                            onClick={() => loadDetails(run.runId)}
                                            className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-all group"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-border/40",
                                                    run.status === 'completed' ? "bg-success/10" : run.status === 'running' ? "bg-warning/10" : "bg-destructive/10"
                                                )}>
                                                    <StatusIcon status={run.status} />
                                                </div>
                                                <div className="text-left">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-foreground">
                                                            Update Run
                                                        </span>
                                                        <Badge variant="outline" className="text-[10px] font-mono h-4 px-1 text-muted-foreground border-border/40">
                                                            {run.runId}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-2.5 mt-1 text-[11px] text-muted-foreground">
                                                        <div className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {new Date(run.timestamp).toLocaleDateString()} at {new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                        {run.finishedAt && (
                                                            <>
                                                                <span className="text-muted-foreground/30">•</span>
                                                                <span className="italic">
                                                                    Took {Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!selectedRun && !loading && runs.length > 0 && (
                    <div className="p-3 border-t border-border bg-muted/20 flex justify-center">
                        <p className="text-[10px] text-muted-foreground italic">
                            Showing the last {runs.length} system update attempts
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
