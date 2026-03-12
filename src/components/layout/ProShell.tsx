'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/lib/ThemeContext';
import {
    LayoutDashboard,
    Terminal,
    Monitor,
    Activity,
    FolderTree,
    Settings,
    LogOut,
    Menu,
    X,
    HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProShellProps {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
    headerContent?: React.ReactNode;
}

const navGroups = [
    {
        label: 'Overview',
        items: [
            { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        ],
    },
    {
        label: 'Modules',
        items: [
            { label: 'Terminal', href: '/terminal', icon: Terminal },
            { label: 'Processes', href: '/processes', icon: Monitor },
            { label: 'Audit Logs', href: '/logs', icon: Activity },
            { label: 'File Browser', href: '/file-browser', icon: FolderTree },
            { label: 'Disk', href: '/disk', icon: HardDrive },
        ],
    },
];

function SidebarNav({ pathname, onNavigate, onLogout }: {
    pathname: string;
    onNavigate?: () => void;
    onLogout: () => void;
}) {
    return (
        <div className="flex flex-col h-full">
            <div className="h-14 flex items-center gap-2.5 px-5 border-b border-sidebar-border shrink-0">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                    <Activity className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="text-sm font-bold text-foreground tracking-tight">ServerMon</span>
            </div>

            <nav className="flex-1 overflow-y-auto py-4 px-3">
                {navGroups.map((group) => (
                    <div key={group.label} className="mb-5">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1.5">
                            {group.label}
                        </p>
                        <div className="space-y-0.5">
                            {group.items.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={onNavigate}
                                        className={cn(
                                            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors min-h-[44px]',
                                            isActive
                                                ? 'bg-primary text-primary-foreground'
                                                : 'text-sidebar-foreground hover:bg-accent hover:text-foreground active:bg-accent',
                                        )}
                                    >
                                        <item.icon className="w-4 h-4 shrink-0" />
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="p-3 border-t border-sidebar-border space-y-0.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Link
                    href="/settings"
                    onClick={onNavigate}
                    className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors min-h-[44px]',
                        pathname === '/settings'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-sidebar-foreground hover:bg-accent hover:text-foreground active:bg-accent',
                    )}
                >
                    <Settings className="w-4 h-4 shrink-0" />
                    Settings
                </Link>
                <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/10 transition-colors cursor-pointer min-h-[44px]"
                >
                    <LogOut className="w-4 h-4 shrink-0" />
                    Log out
                </button>
            </div>
        </div>
    );
}

export default function ProShell({ children, title, subtitle, headerContent }: ProShellProps) {
    const { theme, setTheme, availableThemes } = useTheme();
    const pathname = usePathname();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Close sidebar on route change and lock body scroll when open
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (sidebarOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [sidebarOpen]);

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } finally {
            router.push('/login');
        }
    };

    return (
        <div className="min-h-[100dvh] flex bg-background text-foreground">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex flex-col w-[232px] border-r border-sidebar-border bg-sidebar shrink-0 sticky top-0 h-screen">
                <SidebarNav pathname={pathname} onLogout={handleLogout} />
            </aside>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                        onClick={() => setSidebarOpen(false)}
                    />
                    <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-sidebar border-r border-sidebar-border shadow-xl animate-fade-in">
                        <SidebarNav
                            pathname={pathname}
                            onNavigate={() => setSidebarOpen(false)}
                            onLogout={handleLogout}
                        />
                    </aside>
                </div>
            )}

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="h-14 flex items-center justify-between px-4 lg:px-6 border-b border-border bg-background sticky top-0 z-40">
                    <div className="flex items-center gap-3">
                        <button
                            className="lg:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label="Toggle sidebar"
                        >
                            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                        <div className="flex items-center gap-2 min-w-0">
                            <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
                            {subtitle && (
                                <>
                                    <span className="text-muted-foreground/40 shrink-0">/</span>
                                    <span className="text-sm text-muted-foreground truncate hidden sm:inline">{subtitle}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
                        {headerContent && (
                            <div className="hidden xl:flex items-center gap-2 min-w-0 max-w-[32rem] overflow-x-auto">
                                {headerContent}
                            </div>
                        )}
                        <select
                            value={theme.id}
                            onChange={(e) => setTheme(e.target.value)}
                            className="hidden sm:block h-8 px-2 pr-7 text-xs font-medium bg-secondary border border-border rounded-md text-secondary-foreground outline-none cursor-pointer hover:bg-accent transition-colors appearance-none"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
                        >
                            {availableThemes.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>

                        <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-border">
                            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                                A
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="mx-auto max-w-7xl">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
