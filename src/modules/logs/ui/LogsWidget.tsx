'use client';

import React, { useEffect, useState } from 'react';
import { Clock, Info, AlertTriangle, XCircle, ChevronRight, Activity } from 'lucide-react';

interface LogEntry {
    _id: string;
    moduleId: string;
    event: string;
    timestamp: string;
    severity: 'info' | 'warn' | 'error';
}

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

    const getSeverityStyles = (severity: string) => {
        switch (severity) {
            case 'error': return { icon: <XCircle className="w-3.5 h-3.5" />, color: '#f43f5e', bg: 'bg-rose-500/10' };
            case 'warn': return { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: '#f59e0b', bg: 'bg-amber-500/10' };
            default: return { icon: <Info className="w-3.5 h-3.5" />, color: '#6366f1', bg: 'bg-indigo-500/10' };
        }
    };

    return (
        <div className="flex flex-col h-full animate-fade-in relative">
            <div className="flex-1 space-y-3 overflow-hidden">
                {loading ? (
                    <div className="animate-pulse space-y-3">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl border border-white/5" />)}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-40 text-center">
                        <Activity className="w-8 h-8 mb-4 text-slate-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest italic">No activity recorded yet.</span>
                    </div>
                ) : (
                    logs.map((log) => {
                        const styles = getSeverityStyles(log.severity);
                        return (
                            <div key={log._id} className="group flex gap-4 p-4 rounded-2xl border border-white/5 bg-slate-900/40 hover:bg-slate-900/60 hover:border-white/10 transition-all duration-300">
                                <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${styles.bg} flex items-center justify-center`} style={{ color: styles.color }}>
                                    {styles.icon}
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 opacity-60 group-hover:opacity-100 transition-opacity">{log.moduleId}</span>
                                        <span className="text-[9px] font-black text-slate-600 group-hover:text-slate-400 flex items-center gap-1.5 transition-colors">
                                            <Clock className="w-3 h-3" />
                                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-300 group-hover:text-white truncate transition-colors font-['Inter']">{log.event}</p>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
                <button
                    onClick={() => window.location.href = '/logs'}
                    className="w-full h-12 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] bg-white/5 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-inner group"
                >
                    View Full Audit Trail
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );
}
