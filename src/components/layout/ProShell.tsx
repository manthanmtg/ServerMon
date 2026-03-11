'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/ThemeContext';
import {
    LayoutDashboard,
    Monitor,
    Terminal,
    Settings,
    LogOut,
    Palette,
    Activity,
    Menu,
} from 'lucide-react';

interface ProShellProps {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
}

const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Management' },
    { label: 'Terminal', href: '/terminal', icon: Terminal, group: 'Modules' },
    { label: 'Processes', href: '/processes', icon: Monitor, group: 'Modules' },
    { label: 'Audit Logs', href: '/logs', icon: Activity, group: 'Modules' },
];

const SidebarContent = ({ pathname, onLogout }: { pathname: string; onLogout: () => void }) => (
    <div className="flex flex-col h-full bg-slate-950/80">
        <div className="p-6 flex items-center gap-3 border-b border-white/5 bg-slate-900/40">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
                <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
                <h1 className="text-lg font-bold tracking-tight text-white font-['Outfit']">Server<span className="text-indigo-400">Mon</span></h1>
                <div className="flex items-center gap-1.5 opacity-50">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-300">Console v1.0.4</span>
                </div>
            </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
            {navItems.map((item, i) => {
                const isActive = pathname === item.href;
                const showGroup = i === 0 || navItems[i - 1].group !== item.group;

                return (
                    <React.Fragment key={item.href}>
                        {showGroup && (
                            <div className="px-3 mt-6 mb-2">
                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em]">{item.group}</span>
                            </div>
                        )}
                        <Link
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-xs transition-all group relative ${isActive
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <item.icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300 transition-colors'}`} />
                            {item.label}
                        </Link>
                    </React.Fragment>
                );
            })}
        </nav>

        <div className="p-4 border-t border-white/5 bg-slate-900/20">
            <div className="space-y-1">
                <Link href="/settings" className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-all group">
                    <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform text-slate-500" />
                    Settings
                </Link>
                <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs font-medium transition-all group">
                    <LogOut className="w-4 h-4 text-rose-500/60 group-hover:text-rose-400" />
                    Kill Session
                </button>
            </div>
        </div>
    </div>
);

export default function ProShell({ children, title, subtitle }: ProShellProps) {
    const { theme, setTheme, availableThemes } = useTheme();
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

    const username = "Admin";

    const handleLogout = () => {
        window.location.href = '/login';
    };

    return (
        <div className="min-h-screen flex bg-[#020617] text-slate-200">
            {/* Desktop Sidebar */}
            <aside className="w-64 border-r border-white/5 hidden lg:flex flex-col shrink-0">
                <SidebarContent pathname={pathname} onLogout={handleLogout} />
            </aside>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
                    <aside className="absolute left-0 top-0 bottom-0 w-64 border-r border-white/5 bg-slate-950 shadow-2xl animate-fade-in flex flex-col">
                        <SidebarContent pathname={pathname} onLogout={handleLogout} />
                    </aside>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-slate-950/50 backdrop-blur-md sticky top-0 z-40">
                    <div className="flex items-center gap-4">
                        <button
                            className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
                            onClick={() => setMobileMenuOpen(true)}
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-4">
                            <h2 className="text-base font-bold text-white tracking-tight">{title}</h2>
                            {subtitle && (
                                <>
                                    <div className="h-4 w-[1px] bg-slate-800" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{subtitle}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2 bg-slate-900/60 border border-white/5 p-1 rounded-lg px-2">
                            <Palette className="w-3.5 h-3.5 text-indigo-400" />
                            <select
                                value={theme.id}
                                onChange={(e) => setTheme(e.target.value)}
                                className="bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none border-none cursor-pointer text-slate-400 hover:text-white transition-colors"
                            >
                                {availableThemes.map(t => (
                                    <option key={t.id} value={t.id} className="bg-slate-900 text-white capitalize">{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-3 pl-4 border-l border-white/5">
                            <div className="text-right hidden xs:block">
                                <p className="text-xs font-bold text-white leading-none">{username}</p>
                                <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-0.5">Root</p>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-center font-bold text-xs text-indigo-400">
                                {username[0].toUpperCase()}
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
                    <div className="max-w-7xl mx-auto space-y-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
