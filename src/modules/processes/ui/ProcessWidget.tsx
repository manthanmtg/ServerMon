'use client';

import React, { useEffect, useState } from 'react';
import { List, Activity, Cpu, HardDrive, Hash } from 'lucide-react';

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

    return (
        <div className="glass p-8 rounded-[2.5rem] border-white/5 animate-fade-in">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-500/10 rounded-2xl">
                        <List className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-white tracking-tight uppercase tracking-widest">Active Orchestration</h3>
                        <p className="text-[10px] font-bold text-slate-500">Live system process registry</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                    <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Live</span>
                </div>
            </div>

            <div className="space-y-4">
                {loading ? (
                    <div className="animate-pulse space-y-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-16 bg-white/5 rounded-2xl border border-white/5" />
                        ))}
                    </div>
                ) : (
                    processes.map((p) => (
                        <div key={p.pid} className="group flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-indigo-500/30 hover:bg-white/10 transition-all duration-300">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-900 flex flex-col items-center justify-center border border-white/5 group-hover:bg-indigo-600/20 group-hover:border-indigo-500/20 transition-colors">
                                    <Hash className="w-3 h-3 text-slate-500 group-hover:text-indigo-400" />
                                    <span className="text-[10px] font-black text-white">{p.pid}</span>
                                </div>
                                <div className="space-y-0.5 min-w-0">
                                    <p className="text-sm font-bold text-white truncate max-w-[150px] sm:max-w-xs" title={p.name}>{p.name}</p>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Kernel Task</p>
                                </div>
                            </div>

                            <div className="flex gap-6 shrink-0">
                                <div className="text-right">
                                    <div className="flex items-center gap-1.5 justify-end">
                                        <Cpu className="w-3 h-3 text-indigo-400 opacity-50" />
                                        <span className={`text-sm font-black ${p.cpu > 50 ? 'text-rose-400' : 'text-indigo-400'}`}>
                                            {p.cpu.toFixed(1)}%
                                        </span>
                                    </div>
                                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1 text-right">CPU</p>
                                </div>
                                <div className="text-right">
                                    <div className="flex items-center gap-1.5 justify-end">
                                        <HardDrive className="w-3 h-3 text-pink-400 opacity-50" />
                                        <span className="text-sm font-black text-pink-400">
                                            {p.mem.toFixed(1)}%
                                        </span>
                                    </div>
                                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1 text-right">MEM</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-black tracking-widest uppercase">
                <span className="text-slate-500">Buffer synchronized</span>
                <span className="text-indigo-400">{processes.length} Processes Tracked</span>
            </div>
        </div>
    );
}
