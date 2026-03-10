'use client';

import React, { useEffect, useState } from 'react';
import { List, Activity } from 'lucide-react';

interface ProcessInfo {
    pid: number;
    name: string;
    cpu: number;
    mem: number;
}

export default function ProcessWidget() {
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Initial fetch
        const fetchProcs = async () => {
            try {
                const res = await fetch('/api/modules/processes');
                const data = await res.json();
                setProcesses(data.processes || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchProcs();
        const interval = setInterval(fetchProcs, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="p-6 rounded-2xl border shadow-sm transition-all"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold opacity-40 uppercase tracking-wider">Module: Processes</span>
                <List className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>

            <div className="space-y-3">
                {loading ? (
                    <div className="animate-pulse space-y-2">
                        {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-200 rounded-lg opacity-20" />)}
                    </div>
                ) : (
                    processes.map((p) => (
                        <div key={p.pid} className="flex items-center justify-between p-2 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}>
                                    {p.pid}
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-sm font-bold truncate max-w-[120px]" title={p.name}>{p.name}</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <p className="text-[10px] uppercase opacity-40 font-bold">CPU</p>
                                    <p className="text-xs font-bold" style={{ color: p.cpu > 50 ? 'var(--destructive)' : 'var(--primary)' }}>{p.cpu.toFixed(1)}%</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase opacity-40 font-bold">MEM</p>
                                    <p className="text-xs font-bold">{p.mem.toFixed(1)}%</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-4 pt-4 border-t flex items-center justify-between text-[10px] font-bold opacity-40" style={{ borderColor: 'var(--border)' }}>
                <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> LIVE MONITOR</span>
                <span>{processes.length} ACTIVE</span>
            </div>
        </div>
    );
}
