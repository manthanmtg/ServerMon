'use client';

import React from 'react';
import { Activity, Zap, Cpu, HardDrive, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { renderWidget } from '@/components/modules/ModuleWidgetRegistry';
import ProShell from '@/components/layout/ProShell';

export default function DashboardPage() {
    return (
        <ProShell title="Command Center" subtitle="Overview">
            <div className="mb-10 animate-slide-up">
                <h2 className="text-4xl font-black text-white font-['Outfit'] tracking-tight">System <span className="text-gradient">Pulse</span></h2>
                <p className="text-slate-400 mt-2 font-medium">Real-time telemetry and process orchestration.</p>
            </div>

            {/* Pro Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-up [animation-delay:100ms]">
                {[
                    { label: 'CPU LOAD', value: '12%', sub: '4.2GHz Peak', icon: Cpu, color: '#6366f1' },
                    { label: 'RAM USAGE', value: '2.4 GB', sub: '92% Efficiency', icon: HardDrive, color: '#ec4899' },
                    { label: 'SESSIONS', value: '03', sub: 'Active Links', icon: Zap, color: '#06b6d4' },
                    { label: 'UPTIME', value: '12d 4h', sub: 'Zero Faults', icon: Activity, color: '#10b981' },
                ].map((stat, i) => (
                    <div key={i} className="glass p-8 rounded-[2rem] group hover:scale-[1.02] transition-all duration-500 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <stat.icon className="w-16 h-16" style={{ color: stat.color }} />
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{stat.label}</span>
                        <div className="mt-4 flex flex-col">
                            <span className="text-3xl font-black text-white font-['Outfit']">{stat.value}</span>
                            <span className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1">
                                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: stat.color }} />
                                {stat.sub}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Chart Section */}
            <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8 animate-slide-up [animation-delay:200ms]">
                <div className="glass p-8 rounded-[2.5rem] border-white/5">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold text-white flex items-center gap-3">
                            <Cpu className="w-5 h-5 text-indigo-400" />
                            Processor Flux
                        </h3>
                        <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full">Live</div>
                    </div>
                    <div className="h-[280px]">
                        {renderWidget('CPUChartWidget')}
                    </div>
                </div>

                <div className="glass p-8 rounded-[2.5rem] border-white/5">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold text-white flex items-center gap-3">
                            <HardDrive className="w-5 h-5 text-pink-400" />
                            Memory Entropy
                        </h3>
                        <div className="text-[10px] font-black text-pink-500 uppercase tracking-widest bg-pink-500/10 px-3 py-1 rounded-full">Active</div>
                    </div>
                    <div className="h-[280px]">
                        {renderWidget('MemoryChartWidget')}
                    </div>
                </div>
            </div>

            {/* Feed Section */}
            <div className="mt-10 grid grid-cols-1 xl:grid-cols-3 gap-8 animate-slide-up [animation-delay:300ms]">
                <div className="xl:col-span-2 glass p-8 rounded-[2.5rem] min-h-[400px]">
                    <h3 className="text-lg font-bold text-white mb-8 flex items-center gap-3">
                        <Activity className="w-5 h-5 text-emerald-400" />
                        Kernel Activity Feed
                    </h3>
                    <div className="space-y-4">
                        {renderWidget('LogsWidget')}
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="glass p-8 rounded-[2.5rem]">
                        <h3 className="text-lg font-bold text-white mb-6">Pro Engine</h3>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">
                            ServerMon is optimized for **Phase 11** high-frequency monitoring. All registered modules inherit the deep-space obsidian core.
                        </p>
                        <Link href="/settings" className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-white transition-colors group">
                            System Configuration
                            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>

                    <div className="glass p-8 rounded-[2.5rem] bg-indigo-600/10 border-indigo-500/20">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Diagnostics</h3>
                        {renderWidget('HealthWidget')}
                    </div>
                </div>
            </div>
        </ProShell>
    );
}
