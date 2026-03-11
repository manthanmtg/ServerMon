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
    <>
        <div className="p-8 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
                <h1 className="text-xl font-extrabold tracking-tight text-white font-['Outfit']">Server<span className="text-gradient">Mon</span></h1>
                <div className="flex items-center gap-1.5 opacity-60">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">Console v1.0</span>
                </div>
            </div>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
            {navItems.map((item, i) => {
                const isActive = pathname === item.href;
                const showGroup = i === 0 || navItems[i - 1].group !== item.group;

                return (
                    <React.Fragment key={item.href}>
                        {showGroup && (
                            <div className="px-4 mt-6 mb-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">{item.group}</span>
                            </div>
                        )}
                        <Link
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all group ${isActive
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <item.icon className={`w-5 h-5 ${isActive ? '' : 'group-hover:text-indigo-400 transition-colors'}`} />
                            {item.label}
                        </Link>
                    </React.Fragment>
                );
            })}
        </nav>

        <div className="p-6 mt-auto">
            <div className="glass bg-white/5 border-white/5 rounded-3xl p-4 space-y-4">
                <Link href="/settings" className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-all group">
                    <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform" />
                    Settings
                </Link>
                <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-2 text-rose-400 hover:bg-rose-500/10 rounded-xl text-sm font-bold transition-all">
                    <LogOut className="w-4 h-4" />
                    Kill Session
                </button>
            </div>
        </div>
    </>
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
        <div className="min-h-screen flex selection:bg-indigo-500/30">
            {/* Desktop Sidebar */}
            <aside className="w-72 glass border-r-0 m-4 rounded-[2.5rem] flex flex-col shadow-2xl hidden lg:flex animate-fade-in">
                <SidebarContent pathname={pathname} onLogout={handleLogout} />
            </aside>

            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
                    <aside className="absolute left-4 top-4 bottom-4 w-72 glass border-r-0 rounded-[2.5rem] flex flex-col shadow-2xl animate-slide-up">
                        <SidebarContent pathname={pathname} onLogout={handleLogout} />
                    </aside>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                <header className="h-20 flex items-center justify-between px-6 lg:px-12 animate-fade-in shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
                            onClick={() => setMobileMenuOpen(true)}
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="hidden sm:flex items-center gap-3">
                            <h2 className="text-xl font-bold text-white font-['Outfit']">{title}</h2>
                            {subtitle && (
                                <>
                                    <div className="h-4 w-[1px] bg-slate-800 mx-2" />
                                    <span className="text-sm font-medium text-slate-500">{subtitle}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-3 bg-slate-900/40 border border-slate-800 p-1.5 rounded-2xl px-4 glass">
                            <Palette className="w-4 h-4 text-indigo-400" />
                            <select
                                value={theme.id}
                                onChange={(e) => setTheme(e.target.value)}
                                className="bg-transparent text-[11px] font-black uppercase tracking-widest outline-none border-none cursor-pointer text-slate-300"
                            >
                                {availableThemes.map(t => (
                                    <option key={t.id} value={t.id} className="bg-slate-900 text-white capitalize">{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-4 lg:border-l lg:border-slate-800 lg:pl-6">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-bold text-white">{username}</p>
                                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Master Root</p>
                            </div>
                            <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-900 border border-indigo-500/30 flex items-center justify-center font-black text-indigo-400 shadow-xl shadow-black/40">
                                {username[0].toUpperCase()}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="p-6 lg:p-12 pt-4">
                    {children}
                </div>
            </main>
        </div>
    );
}
