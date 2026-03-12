'use client';

import React, { useEffect, useState } from 'react';
import { Info, AlertTriangle, XCircle, Clock, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface LogEntry {
    _id: string;
    moduleId: string;
    event: string;
    metadata: Record<string, unknown>;
    severity: 'info' | 'warn' | 'error';
    timestamp: string;
}

type FilterType = 'all' | 'info' | 'warn' | 'error';

const severityConfig = {
    info: { icon: Info, variant: 'default' as const, label: 'Info', color: 'text-primary' },
    warn: { icon: AlertTriangle, variant: 'warning' as const, label: 'Warning', color: 'text-warning' },
    error: { icon: XCircle, variant: 'destructive' as const, label: 'Error', color: 'text-destructive' },
};

function MobileLogCard({ log }: { log: LogEntry }) {
    const config = severityConfig[log.severity] || severityConfig.info;
    const Icon = config.icon;
    return (
        <div className="p-3 border-b border-border last:border-0">
            <div className="flex items-start gap-3">
                <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', config.color)} />
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{log.event}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground capitalize">{log.moduleId}</span>
                        <span className="text-muted-foreground/30">·</span>
                        <span className="text-xs text-muted-foreground">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('all');
    const [search, setSearch] = useState('');

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/analytics/recent?limit=100');
                const data = await res.json();
                setLogs(data.events || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
        const interval = setInterval(fetchLogs, 15000);
        return () => clearInterval(interval);
    }, []);

    const filtered = logs.filter((log) => {
        if (filter !== 'all' && log.severity !== filter) return false;
        if (search && !log.event.toLowerCase().includes(search.toLowerCase()) &&
            !log.moduleId.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const filters: { label: string; value: FilterType }[] = [
        { label: 'All', value: 'all' },
        { label: 'Info', value: 'info' },
        { label: 'Warn', value: 'warn' },
        { label: 'Error', value: 'error' },
    ];

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1 sm:max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full h-10 sm:h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
                    />
                </div>
                <div className="flex items-center gap-1 bg-secondary p-1 rounded-lg overflow-x-auto">
                    {filters.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setFilter(f.value)}
                            className={cn(
                                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap min-h-[32px]',
                                filter === f.value
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                        {search || filter !== 'all' ? 'No matching logs found' : 'No log entries yet'}
                    </div>
                ) : (
                    <>
                        {/* Mobile card layout */}
                        <div className="sm:hidden">
                            {filtered.map((log) => (
                                <MobileLogCard key={log._id} log={log} />
                            ))}
                        </div>

                        {/* Desktop table layout */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-left min-w-[600px]">
                                <thead>
                                    <tr className="border-b border-border bg-secondary/50">
                                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Level</th>
                                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Module</th>
                                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Event</th>
                                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Metadata</th>
                                        <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((log) => {
                                        const config = severityConfig[log.severity] || severityConfig.info;
                                        return (
                                            <tr key={log._id} className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <Badge variant={config.variant}>{config.label}</Badge>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-muted-foreground capitalize">{log.moduleId}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-foreground">{log.event}</span>
                                                </td>
                                                <td className="px-4 py-3 hidden lg:table-cell">
                                                    <span className="text-xs font-mono text-muted-foreground truncate block max-w-[200px]">
                                                        {JSON.stringify(log.metadata)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-xs text-muted-foreground flex items-center justify-end gap-1 whitespace-nowrap">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(log.timestamp).toLocaleTimeString([], {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                            second: '2-digit',
                                                        })}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                <div className="px-4 py-3 border-t border-border bg-secondary/30 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        Refreshes every 15s
                    </span>
                </div>
            </div>
        </div>
    );
}
