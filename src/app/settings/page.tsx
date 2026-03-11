'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Palette, Box, Shield, Zap } from 'lucide-react';
import ProShell from '@/components/layout/ProShell';

interface ModuleInfo {
    id: string;
    name: string;
    description?: string;
}

export default function SettingsPage() {
    const { theme, setTheme, availableThemes } = useTheme();
    const [modules, setModules] = useState<ModuleInfo[]>([]);

    useEffect(() => {
        fetch('/api/modules')
            .then(res => res.json())
            .then(data => setModules(data.modules || []))
            .catch(err => console.error(err));
    }, []);

    return (
        <ProShell title="System Settings" subtitle="Configuration">
            <div className="mb-12 animate-slide-up">
                <h2 className="text-4xl font-black text-white font-['Outfit'] tracking-tight">Personalization <span className="text-gradient">& Control</span></h2>
                <p className="text-slate-400 mt-2 font-medium">Fine-tune the command center&apos;s visual and functional parameters.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-slide-up [animation-delay:100ms]">
                {/* Theme Selector */}
                <div className="xl:col-span-2 space-y-8">
                    <div className="glass p-8 rounded-[2.5rem] border-white/5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <Palette className="w-24 h-24 text-indigo-400" />
                        </div>

                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-3 bg-indigo-500/10 rounded-2xl">
                                <Palette className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white tracking-tight">Interface Skin</h3>
                                <p className="text-sm text-slate-500 font-medium">Select a high-tier telemetry palette.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {availableThemes.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTheme(t.id)}
                                    className={`group relative p-1 rounded-3xl border-2 transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] ${theme.id === t.id ? 'border-indigo-500' : 'border-white/5 opacity-60 hover:opacity-100'
                                        }`}
                                >
                                    <div className="rounded-2xl p-5 text-left space-y-4 shadow-2xl" style={{ backgroundColor: t.colors.background }}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-black uppercase tracking-widest" style={{ color: t.colors.foreground }}>{t.name}</span>
                                            {theme.id === t.id && (
                                                <div className="p-1 px-2 rounded-full bg-indigo-500 text-[10px] font-black text-white uppercase tracking-tighter shadow-lg shadow-indigo-500/40">
                                                    Active
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2 h-4">
                                            <div className="flex-1 rounded-full shadow-lg" style={{ backgroundColor: t.colors.primary }} />
                                            <div className="flex-1 rounded-full shadow-lg" style={{ backgroundColor: t.colors.accent }} />
                                            <div className="flex-1 rounded-full shadow-lg" style={{ backgroundColor: t.colors.secondary }} />
                                        </div>

                                        <div className="p-2.5 rounded-xl border text-[9px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-70 transition-opacity" style={{ backgroundColor: t.colors.card, color: t.colors.cardForeground, borderColor: t.colors.border }}>
                                            Core.Render()
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Module List */}
                    <div className="glass p-8 rounded-[2.5rem] border-white/5">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-3 bg-pink-500/10 rounded-2xl">
                                <Box className="w-6 h-6 text-pink-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white tracking-tight">Integrated Modules</h3>
                                <p className="text-sm text-slate-500 font-medium">Active sub-system management.</p>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            {modules.map(mod => (
                                <div key={mod.id} className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group">
                                    <div className="flex items-center gap-5">
                                        <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center border border-white/5">
                                            <Zap className="w-6 h-6 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-white text-sm tracking-tight">{mod.name}</h4>
                                            <p className="text-xs font-medium text-slate-500 mt-0.5">{mod.description || 'Active background process.'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Active</span>
                                        </div>
                                        <button className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20">
                                            Suspend
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Info & Help */}
                <div className="space-y-8">
                    <div className="glass p-8 rounded-[2.5rem] bg-indigo-600/5 border-indigo-500/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <Shield className="w-16 h-16 text-indigo-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-4">Security Baseline</h3>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">
                            Your current installation is secured via **Argon2id** hashing and **TOTP-HMAC** two-factor authentication.
                        </p>
                        <div className="mt-8 pt-8 border-t border-indigo-500/20 space-y-4">
                            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-500">
                                <span>Version</span>
                                <span className="text-indigo-400">1.0.4-PRO</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-500">
                                <span>Encryption</span>
                                <span className="text-indigo-400">AES-256-GCM</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass p-8 rounded-[2.5rem] relative overflow-hidden">
                        <h3 className="text-lg font-bold text-white mb-6">Expert Mode</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400">Debugger Mode</span>
                                <div className="w-10 h-5 bg-slate-800 rounded-full relative">
                                    <div className="absolute left-1 top-1 w-3 h-3 bg-slate-600 rounded-full" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400">Low Entropy Mode</span>
                                <div className="w-10 h-5 bg-indigo-600 rounded-full relative">
                                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ProShell>
    );
}
