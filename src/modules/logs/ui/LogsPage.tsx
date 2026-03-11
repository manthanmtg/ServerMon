'use client';

import React, { useEffect, useState } from 'react';
import { Info, AlertTriangle, XCircle, Search, Filter, Clock } from 'lucide-react';

interface LogEntry {
    _id: string;
    moduleId: string;
    event: string;
    metadata: Record<string, unknown>;
    severity: 'info' | 'warn' | 'error';
    timestamp: string;
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);

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

    const getSeverityStyles = (severity: string) => {
        switch (severity) {
            case 'error': return { icon: <XCircle className="w-4 h-4 text-rose-500" />, color: '#f43f5e', bg: 'bg-rose-500/10' };
            case 'warn': return { icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, color: '#f59e0b', bg: 'bg-amber-500/10' };
            default: return { icon: <Info className="w-4 h-4 text-indigo-500" />, color: '#6366f1', bg: 'bg-indigo-500/10' };
        }
    };

    return (
        <div className="animate-fade-in flex flex-col gap-6">
            {/* Local Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-3xl border border-white/5 glass">
                <div className="relative w-full sm:w-80 group">
                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        className="w-full bg-slate-950/40 border border-slate-800 rounded-xl pl-12 pr-4 py-2 text-xs font-bold outline-none ring-2 ring-transparent focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all text-white placeholder-slate-600"
                    />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="hidden sm:flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-xl border border-white/5">
                        {['All', 'Info', 'Warn', 'Error'].map(f => (
                            <button key={f} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${f === 'All' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-white'}`}>
                                {f}
                            </button>
                        ))}
                    </div>
                    <button className="flex-1 sm:flex-none p-2.5 rounded-xl bg-slate-950/60 border border-white/5 hover:bg-slate-900 transition-all group">
                        <Filter className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
                    </button>
                </div>
            </div>

            {/* Table Container */}
            <div className="rounded-[2.5rem] border border-white/5 shadow-22 shadow-black/40 overflow-hidden bg-slate-950/40 backdrop-blur-md">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/5">
                                <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Level</th>
                                <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Module</th>
                                <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Event</th>
                                <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Metadata</th>
                                <th className="px-8 py-5 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="text-[13px]">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-24 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Querying Archive</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-16 text-center text-slate-600 font-bold italic">No log entries registered in the last session.</td>
                                </tr>
                            ) : logs.map((log) => {
                                const styles = getSeverityStyles(log.severity);
                                return (
                                    <tr key={log._id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg w-fit" style={{ backgroundColor: styles.color + '10' }}>
                                                {styles.icon}
                                                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: styles.color }}>{log.severity}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                                                <span className="font-mono text-[11px] font-bold text-slate-400 group-hover:text-white transition-colors capitalize">{log.moduleId}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <p className="font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">{log.event}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="font-mono text-[10px] text-slate-600 italic truncate max-w-[200px] hover:max-w-none transition-all cursor-help bg-slate-900/40 px-3 py-1.5 rounded-lg border border-white/5">
                                                {JSON.stringify(log.metadata)}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2 text-slate-500 font-bold text-[11px]">
                                                <Clock className="w-3.5 h-3.5" />
                                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex items-center justify-between px-4 mt-2">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic">Streamed from Kernel Analytics v1.0.4</span>
                <span className="text-[10px] font-black text-indigo-500/60 uppercase tracking-widest">{logs.length} Total Events Parsed</span>
            </div>
        </div>
    );
}
