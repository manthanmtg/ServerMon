'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Cpu, HardDrive } from 'lucide-react';

const StatusRow = ({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) => (
    <div className="flex items-center justify-between group">
        <div className="flex items-center gap-2">
            <Icon className={`w-3.5 h-3.5 ${color} opacity-60 group-hover:opacity-100 transition-opacity`} />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
        </div>
        <span className="text-xs font-bold text-white tracking-tight">{value}</span>
    </div>
);

const ProgressBar = ({ percent, color }: { percent: number; color: string }) => (
    <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-1.5">
        <div
            className={`h-full transition-all duration-700 ease-out ${color}`}
            style={{ width: `${percent}%` }}
        />
    </div>
);

export default function HealthWidget() {
    const [health, setHealth] = useState({ status: 'healthy', cpu: 12, disk: 42, ram: 28 });

    useEffect(() => {
        const interval = setInterval(() => {
            setHealth(prev => ({
                ...prev,
                cpu: Math.floor(Math.random() * 10) + 8,
                ram: Math.floor(Math.random() * 5) + 25
            }));
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="animate-fade-in flex flex-col gap-5 h-full">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Global Integrity</span>
                </div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">v1.2 stable</span>
            </div>

            <div className="space-y-4 flex-1">
                <div className="space-y-1">
                    <StatusRow label="Core Utilization" value={`${health.cpu}%`} icon={Cpu} color="text-indigo-400" />
                    <ProgressBar percent={health.cpu} color="bg-indigo-500" />
                </div>
                <div className="space-y-1">
                    <StatusRow label="Volatile Entropy" value={`${health.ram}%`} icon={Activity} color="text-pink-400" />
                    <ProgressBar percent={health.ram} color="bg-pink-500" />
                </div>
                <div className="space-y-1">
                    <StatusRow label="Persistent Storage" value={`${health.disk}%`} icon={HardDrive} color="text-emerald-400" />
                    <ProgressBar percent={health.disk} color="bg-emerald-500" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                    Last sync
                </div>
                <div className="text-[9px] font-bold text-slate-300 uppercase tracking-widest text-right">
                    Just now
                </div>
            </div>
        </div>
    );
}
