'use client';

import React, { useEffect, useState } from 'react';
import { History, Clock, Info, AlertTriangle, XCircle } from 'lucide-react';

export default function LogsWidget() {
    const [logs, setLogs] = useState<any[]>([]);
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

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'error': return <XCircle className="w-3 h-3 text-red-500" />;
            case 'warn': return <AlertTriangle className="w-3 h-3 text-yellow-500" />;
            default: return <Info className="w-3 h-3 text-blue-500" />;
        }
    };

    return (
        <div className="p-6 rounded-2xl border shadow-sm flex flex-col h-full"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold opacity-40 uppercase tracking-wider">Module: Activity Log</span>
                <History className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>

            <div className="flex-1 space-y-3 overflow-hidden">
                {loading ? (
                    <div className="animate-pulse space-y-3">
                        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-200 rounded-xl opacity-10" />)}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-8 opacity-40 text-xs italic">No activity recorded yet.</div>
                ) : (
                    logs.map((log) => (
                        <div key={log._id} className="flex gap-3 p-3 rounded-xl border transition-all" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
                            <div className="mt-0.5">{getSeverityIcon(log.severity)}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-bold uppercase opacity-50 truncate mr-2">{log.moduleId}</span>
                                    <span className="text-[9px] opacity-30 flex items-center gap-1 font-mono">
                                        <Clock className="w-2.5 h-2.5" />
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-xs font-medium truncate opacity-90">{log.event}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                    onClick={() => window.location.href = '/logs'}
                    className="w-full py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                    style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}>
                    View Full Audit Trail
                </button>
            </div>
        </div>
    );
}
