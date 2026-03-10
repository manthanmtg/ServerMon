import React, { useEffect, useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Shield, Settings, Palette, Check, Save, Box, Activity } from 'lucide-react';
import Link from 'next/link';

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
        <div className="min-h-screen flex" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
            {/* Reusable Sidebar (Simplified for now) */}
            <aside className="w-64 border-r flex flex-col shadow-sm" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="p-6 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                    <Shield className="w-8 h-8" style={{ color: 'var(--primary)' }} />
                    <h1 className="text-xl font-bold tracking-tight italic">ServerMon</h1>
                </div>
                <nav className="flex-1 p-4">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2 hover:opacity-80 rounded-lg transition-all"
                        style={{ color: 'var(--foreground)' }}>
                        Dashboard
                    </Link>
                    <div className="pt-4 pb-2 px-4 text-xs font-bold uppercase tracking-wider opacity-50">System</div>
                    <Link href="/settings" className="flex items-center gap-3 px-4 py-2 rounded-lg font-medium"
                        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                        <Settings className="w-5 h-5" />
                        Settings
                    </Link>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                <header className="h-16 border-b flex items-center px-8 shadow-sm" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2">
                        <span className="opacity-50">System</span>
                        <span className="opacity-50">/</span>
                        <span className="font-medium">Settings</span>
                    </div>
                </header>

                <div className="p-12 max-w-4xl">
                    <div className="mb-12">
                        <h2 className="text-4xl font-bold italic tracking-tight">System Settings</h2>
                        <p className="opacity-60 text-lg mt-2 font-medium">Configure global system behavior and personalization.</p>
                    </div>

                    <section className="space-y-8">
                        <div className="border rounded-3xl p-8" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--primary)', opacity: 0.1 }}>
                                    <Palette className="w-6 h-6" style={{ color: 'var(--primary)' }} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">Appearance & Themes</h3>
                                    <p className="text-sm opacity-50">Choose a color palette that matches your preference.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {availableThemes.map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTheme(t.id)}
                                        className={`relative p-1 rounded-2xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${theme.id === t.id ? '' : 'opacity-80'}`}
                                        style={{ borderColor: theme.id === t.id ? 'var(--primary)' : 'var(--border)' }}
                                    >
                                        <div className="rounded-xl p-4 text-left space-y-3 shadow-sm" style={{ backgroundColor: t.colors.background }}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-bold truncate" style={{ color: t.colors.foreground }}>{t.name}</span>
                                                {theme.id === t.id && (
                                                    <div className="p-1 rounded-full" style={{ backgroundColor: t.colors.primary }}>
                                                        <Check className="w-3 h-3" style={{ color: t.colors.primaryForeground }} />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-1.5 h-3">
                                                <div className="flex-1 rounded-full" style={{ backgroundColor: t.colors.primary }} />
                                                <div className="flex-1 rounded-full" style={{ backgroundColor: t.colors.accent }} />
                                                <div className="flex-1 rounded-full" style={{ backgroundColor: t.colors.secondary }} />
                                            </div>

                                            <div className="p-2 rounded-lg border text-[10px] font-mono opacity-50" style={{ backgroundColor: t.colors.card, color: t.colors.cardForeground, borderColor: t.colors.border }}>
                                                System.init()
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border rounded-3xl p-8" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--primary)', opacity: 0.1 }}>
                                    <Box className="w-6 h-6" style={{ color: 'var(--primary)' }} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">Module Management</h3>
                                    <p className="text-sm opacity-50">Manage installed modules and their system integration.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {modules.map(mod => (
                                    <div key={mod.id} className="flex items-center justify-between p-4 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--secondary)' }}>
                                                <Activity className="w-5 h-5 opacity-70" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold">{mod.name}</h4>
                                                <p className="text-xs opacity-50">{mod.description || 'No description provided.'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-mono px-2 py-1 rounded bg-green-500 bg-opacity-10 text-green-500 uppercase font-bold">
                                                Running
                                            </span>
                                            <button className="px-4 py-1.5 rounded-xl text-xs font-bold border hover:bg-red-50 hover:bg-opacity-10 hover:text-red-500 transition-all" style={{ borderColor: 'var(--border)' }}>
                                                Disable
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button className="flex items-center gap-2 px-8 py-3 rounded-2xl font-bold shadow-lg transition-transform hover:scale-105 active:scale-95"
                                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                                <Save className="w-5 h-5" />
                                Apply Changes
                            </button>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
