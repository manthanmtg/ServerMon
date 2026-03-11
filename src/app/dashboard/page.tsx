'use client';

import React from 'react';
import { Activity, Zap, Cpu, HardDrive, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { renderWidget } from '@/components/modules/ModuleWidgetRegistry';
import ProShell from '@/components/layout/ProShell';

export default function DashboardPage() {
    return (
        <ProShell title="Dashboard" subtitle="System Overview">
            <div className="flex flex-col gap-8 pb-12">
                
                {/* Metrics Row */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
                    {[
                        { label: 'CPU LOAD', value: '12%', sub: '4.2GHz', icon: Cpu, color: 'text-indigo-400' },
                        { label: 'MEMORY', value: '2.4 GB', sub: '92% eff', icon: HardDrive, color: 'text-pink-400' },
                        { label: 'SESSIONS', value: '03', sub: 'Active', icon: Zap, color: 'text-amber-400' },
                        { label: 'UPTIME', value: '12d 4h', sub: 'Stable', icon: Activity, color: 'text-emerald-400' },
                    ].map((stat, i) => (
                        <div key={i} className="card p-5 group">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{stat.label}</span>
                                <stat.icon className={`w-4 h-4 ${stat.color} opacity-60 group-hover:opacity-100 transition-opacity`} />
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-2xl font-bold text-white tracking-tight">{stat.value}</span>
                                <span className="text-[10px] font-medium text-slate-500 mb-1">{stat.sub}</span>
                            </div>
                        </div>
                    ))}
                </section>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Primary Analytics Section */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* CPU FLUX */}
                        <div className="card h-[400px] flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/20">
                                <div className="flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-indigo-400" />
                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Processor Flux</h3>
                                </div>
                                <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">Live</span>
                            </div>
                            <div className="flex-1 p-4">
                                {renderWidget('CPUChartWidget')}
                            </div>
                        </div>

                        {/* Logs Section */}
                        <div className="card h-[400px] flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/20">
                                <div className="flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-emerald-400" />
                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Kernel Activity Feed</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Streaming</span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                {renderWidget('LogsWidget')}
                            </div>
                        </div>
                    </div>

                    {/* Secondary Utility Section */}
                    <div className="space-y-8">
                        {/* Memory Entropy */}
                        <div className="card h-[300px] flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/20">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="w-4 h-4 text-pink-400" />
                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Memory Map</h3>
                                </div>
                            </div>
                            <div className="flex-1 p-4">
                                {renderWidget('MemoryChartWidget')}
                            </div>
                        </div>

                        {/* Diagnostics & Health */}
                        <div className="card flex-1 flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-white/5 bg-slate-900/20">
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                    <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                                    System Diagnostics
                                </h3>
                            </div>
                            <div className="p-4 flex-1">
                                {renderWidget('HealthWidget')}
                            </div>
                            <div className="p-4 border-t border-white/5 bg-slate-900/10 grid grid-cols-2 gap-2">
                                <div className="p-2 rounded-lg bg-slate-950/50 border border-white/5 text-center">
                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter block">Polling</span>
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5 tracking-tighter">Real-time</span>
                                </div>
                                <div className="p-2 rounded-lg bg-slate-950/50 border border-white/5 text-center">
                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter block">Engine</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 tracking-tighter">v1.4.2</span>
                                </div>
                            </div>
                        </div>

                        {/* Pro Engine Callout */}
                        <div className="card p-5 bg-gradient-to-br from-indigo-600/10 to-transparent border-indigo-500/20">
                            <h3 className="text-sm font-bold text-white mb-2">Pro Console</h3>
                            <p className="text-[11px] text-slate-400 leading-relaxed font-medium mb-4">
                                High-frequency monitoring active. All modules inherited the LifeOS infrastructure core for maximum telemetry density.
                            </p>
                            <Link href="/settings" className="flex items-center justify-between p-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20">
                                <span className="text-[9px] font-bold uppercase tracking-widest">Registry</span>
                                <ChevronRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>

                </div>
            </div>
        </ProShell>
    );
}
