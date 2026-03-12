'use client';

import React, { useEffect, useState } from 'react';
import { Info, AlertTriangle, XCircle, Clock } from 'lucide-react';
import Link from 'next/link';

interface LogEntry {
    _id: string;
    moduleId: string;
    event: string;
    timestamp: string;
    severity: 'info' | 'warn' | 'error';
}

const severityConfig = {
    info: { icon: Info, color: 'text-primary', bg: 'bg-primary/10' },
    warn: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
    error: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function LogsWidget() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const res = await fetch('/api/analytics/recent?limit=5');
                const data = await res.json();
                setLogs(data.events || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
        const interval = setInterval(fetchLogs, 10000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 rounded-lg bg-secondary animate-pulse" />
                ))}
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground text-sm">
                No activity recorded yet
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                {logs.map((log) => {
                    const config = severityConfig[log.severity] || severityConfig.info;
                    const Icon = config.icon;
                    return (
                        <div key={log._id} className="flex items-start gap-3 py-2 group">
                            <div className={`mt-0.5 w-7 h-7 rounded-md ${config.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{log.event}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-muted-foreground capitalize">{log.moduleId}</span>
                                    <span className="text-muted-foreground/30">·</span>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <Link
                href="/logs"
                className="block text-center text-sm text-primary hover:text-primary/80 font-medium transition-colors py-2"
            >
                View all logs
            </Link>
        </div>
    );
}
