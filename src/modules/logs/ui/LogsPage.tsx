'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Shield, ClipboardList, Home, Settings, Info, AlertTriangle, XCircle, ChevronLeft, Search, Filter, Clock } from 'lucide-react';
import Link from 'next/link';

export default function LogsPage() {
    const { theme } = useTheme();
    const [logs, setLogs] = useState<any[]>([]);
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
            case 'error': return { icon: <XCircle className="w-4 h-4" />, color: 'var(--destructive)', bg: 'bg-red-500' };
            case 'warn': return { icon: <AlertTriangle className="w-4 h-4" />, color: 'var(--accent)', bg: 'bg-yellow-500' };
            default: return { icon: <Info className="w-4 h-4" />, color: 'var(--primary)', bg: 'bg-blue-500' };
        }
    };

    return (
        <div className="min-h-screen flex" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
            {/* Sidebar */}
            <aside className="w-64 border-r flex flex-col shadow-sm" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="p-6 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                    <Shield className="w-8 h-8" style={{ color: 'var(--primary)' }} />
                    <h1 className="text-xl font-bold tracking-tight italic">ServerMon</h1>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2 hover:opacity-80 rounded-lg transition-all"
                        style={{ color: 'var(--foreground)' }}>
                        <Home className="w-5 h-5" />
                        Dashboard
                    </Link>
                    <Link href="/terminal" className="flex items-center gap-3 px-4 py-2 hover:opacity-80 rounded-lg transition-all"
                        style={{ color: 'var(--foreground)' }}>
                        <ClipboardList className="w-5 h-5" />
                        Terminal
                    </Link>
                    <Link href="/logs" className="flex items-center gap-3 px-4 py-2 rounded-lg font-medium"
                        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                        <ClipboardList className="w-5 h-5" />
                        Audit Logs
                    </Link>
                </nav>

                <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <Link href="/settings" className="flex items-center gap-3 px-4 py-2 hover:opacity-80 rounded-lg transition-all"
                        style={{ color: 'var(--foreground)' }}>
                        <Settings className="w-5 h-5" />
                        Settings
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 border-b flex items-center justify-between px-8 shadow-sm"
                    style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2">
                        <span className="opacity-50">System</span>
                        <span className="opacity-50">/</span>
                        <span className="font-medium">Audit Logs</span>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-30 group-focus-within:opacity-100 transition-opacity" />
                            <input
                                type="text"
                                placeholder="Filter logs..."
                                className="bg-secondary bg-opacity-30 border-none rounded-xl pl-10 pr-4 py-1.5 text-xs font-bold outline-none ring-1 ring-border focus:ring-primary transition-all w-64"
                            />
                        </div>
                        <button className="p-2 rounded-xl bg-secondary bg-opacity-30 border border-border">
                            <Filter className="w-4 h-4 opacity-50" />
                        </button>
                    </div>
                </header>

                <div className="flex-1 p-8 overflow-y-auto">
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold italic">System Audit Trail</h2>
                        <p className="opacity-60 text-sm mt-1">Real-time persistent event logging for security and diagnostics.</p>
                    </div>

                    <div className="rounded-3xl border shadow-xl overflow-hidden"
                        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--secondary)', opacity: 0.5 }}>
                                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Level</th>
                                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Module</th>
                                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Event</th>
                                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Metadata</th>
                                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Timestamp</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-20 text-center opacity-40">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Clock className="w-6 h-6 animate-spin" />
                                                    <span className="font-bold text-xs">Accessing deep archive...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : logs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center opacity-40 italic">No events found.</td>
                                        </tr>
                                    ) : logs.map((log) => {
                                        const styles = getSeverityStyles(log.severity);
                                        return (
                                            <tr key={log._id} className="border-b hover:bg-black hover:bg-opacity-5 transition-colors" style={{ borderColor: 'var(--border)' }}>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 font-bold uppercase text-[10px]" style={{ color: styles.color }}>
                                                        {styles.icon}
                                                        {log.severity}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-mono text-[11px] font-bold opacity-70">
                                                    {log.moduleId}
                                                </td>
                                                <td className="px-6 py-4 font-medium max-w-xs truncate">
                                                    {log.event}
                                                </td>
                                                <td className="px-6 py-4 font-mono text-[10px] opacity-40 italic truncate max-w-[200px]">
                                                    {JSON.stringify(log.metadata)}
                                                </td>
                                                <td className="px-6 py-4 text-[11px] font-bold opacity-50">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
