'use client';

import React, { useEffect, useState } from 'react';
import { X, Clock, User, Terminal, AlertCircle, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface HistoryRecord {
    _id: string;
    sessionId: string;
    label: string;
    createdBy: string;
    createdAt: string;
    closedAt?: string;
    closedBy?: string;
    exitCode?: number;
    signal?: string;
    durationMinutes?: number;
}

interface TerminalHistoryModalProps {
    onClose: () => void;
}

export default function TerminalHistoryModal({ onClose }: TerminalHistoryModalProps) {
    const [history, setHistory] = useState<HistoryRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/terminal/history');
            const data = await res.json();
            if (data.history) {
                setHistory(data.history);
            } else {
                setError(data.error || 'Failed to fetch history');
            }
        } catch (_err) {
            setError('Failed to fetch terminal history');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getClosedByDisplay = (record: HistoryRecord) => {
        if (!record.closedAt) return '-';
        if (record.closedBy === 'timeout-autokill') {
            return (
                <Badge variant="outline" className="text-[10px] text-warning border-warning/20 bg-warning/5">
                    Timeout
                </Badge>
            );
        }
        if (record.closedBy === 'process-exit') {
            return ( record.exitCode === 0 ? 
                <Badge variant="outline" className="text-[10px] text-success border-success/20 bg-success/5">
                    Exit 0
                </Badge> : 
                <Badge variant="outline" className="text-[10px] text-destructive border-destructive/20 bg-destructive/5">
                    Exit {record.exitCode || record.signal}
                </Badge>
            );
        }
        if (record.closedBy?.startsWith('user:')) {
            return (
                <div className="flex items-center gap-1 text-[11px]">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span>{record.closedBy.split(':')[1]}</span>
                </div>
            );
        }
        return record.closedBy || 'Unknown';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in" onClick={onClose} />
            <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl animate-slide-up overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <History className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-foreground leading-none">Session History</h2>
                            <p className="text-xs text-muted-foreground mt-1">Review metadata of historical terminal sessions</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full w-8 h-8">
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-0">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-3">
                            <Spinner size="lg" />
                            <p className="text-sm text-muted-foreground animate-pulse">Loading sessions...</p>
                        </div>
                    ) : error ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-2 p-6 text-center">
                            <AlertCircle className="w-10 h-10 text-destructive/50" />
                            <p className="text-sm text-foreground font-medium">{error}</p>
                            <Button variant="outline" size="sm" onClick={fetchHistory} className="mt-2">Try Again</Button>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-2 p-6 text-center">
                            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-2">
                                <Terminal className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-foreground font-medium">No history yet</p>
                            <p className="text-xs text-muted-foreground">Historical sessions will appear here once they are closed</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10 bg-card border-b border-border">
                                <tr className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                    <th className="px-4 py-3 font-semibold">Terminal Name</th>
                                    <th className="px-4 py-3 font-semibold">Created By</th>
                                    <th className="px-4 py-3 font-semibold">Started At</th>
                                    <th className="px-4 py-3 font-semibold">Duration</th>
                                    <th className="px-4 py-3 font-semibold">Closed By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {history.map((record) => (
                                    <tr 
                                        key={record._id} 
                                        className="text-xs transition-colors hover:bg-secondary/20"
                                    >
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-1.5 h-1.5 rounded-full shrink-0",
                                                    record.closedAt ? "bg-muted-foreground/30" : "bg-success animate-pulse"
                                                )} />
                                                <span className="font-medium text-foreground truncate max-w-[140px]">{record.label}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                                                    {record.createdBy.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-muted-foreground truncate">{record.createdBy}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap font-mono tabular-nums">
                                            {formatDate(record.createdAt)}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            {record.durationMinutes !== undefined ? (
                                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{record.durationMinutes}m</span>
                                                </div>
                                            ) : (
                                                <Badge variant="success" className="text-[9px] h-4 px-1 leading-none">Active</Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 min-w-[120px]">
                                            {getClosedByDisplay(record)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-border bg-secondary/10 flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex gap-4">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-success" />
                            <span>Active Session</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                            <span>Closed Session</span>
                        </div>
                    </div>
                    <span>Showing last 50 sessions</span>
                </div>
            </div>
        </div>
    );
}
