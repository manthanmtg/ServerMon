'use client';

import React, { useEffect, useState } from 'react';
import { Cpu, MemoryStick } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-border bg-secondary/50">
                            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">PID</th>
                            <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Process</th>
                            <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">
                                <span className="inline-flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</span>
                            </th>
                            <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">
                                <span className="inline-flex items-center gap-1"><MemoryStick className="w-3 h-3" /> Memory</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {processes.map((p) => (
                            <tr key={p.pid} className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors">
                                <td className="px-4 py-3">
                                    <span className="text-xs font-mono text-muted-foreground">{p.pid}</span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-sm font-medium text-foreground truncate block max-w-[200px] sm:max-w-none" title={p.name}>
                                        {p.name}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <span className={`text-sm font-medium tabular-nums ${p.cpu > 50 ? 'text-destructive' : p.cpu > 20 ? 'text-warning' : 'text-foreground'}`}>
                                        {p.cpu.toFixed(1)}%
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <span className="text-sm font-medium text-foreground tabular-nums">
                                        {p.mem.toFixed(1)}%
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-3 border-t border-border bg-secondary/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                    {processes.length} processes
                </span>
                <span className="text-xs text-muted-foreground">
                    Refreshes every 5s
                </span>
            </div>
        </div>
    );
}
