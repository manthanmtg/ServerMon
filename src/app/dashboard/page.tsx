import React from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Shield, LayoutDashboard, Monitor, Terminal, Settings, LogOut, Moon, Sun, Palette } from 'lucide-react';
import Link from 'next/link';
import { renderWidget } from '@/components/modules/ModuleWidgetRegistry';

export default function DashboardPage() {
    const { theme, setTheme, availableThemes } = useTheme();

    // Simulated registered module widgets
    const registeredWidgets = [
        { id: 'h1', component: 'HealthWidget' },
        { id: 'p1', component: 'ProcessWidget' },
        { id: 'l1', component: 'LogsWidget' },
        { id: 'c1', component: 'CPUChartWidget' },
        { id: 'm1', component: 'MemoryChartWidget' }
    ];

    const username = "Admin";

    const handleLogout = () => {
        // Implement logout logic
        window.location.href = '/login';
    };

    return (
        <div className="min-h-screen flex" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
            {/* Sidebar */}
            <aside className="w-64 border-r flex flex-col shadow-sm" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="p-6 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                    <Shield className="w-8 h-8" style={{ color: 'var(--primary)' }} />
                    <h1 className="text-xl font-bold tracking-tight italic">ServerMon</h1>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2 rounded-lg font-medium"
                        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                        <LayoutDashboard className="w-5 h-5" />
                        Dashboard
                    </Link>
                    <div className="pt-4 pb-2 px-4 text-xs font-bold uppercase tracking-wider opacity-50">
                        Modules
                    </div>
                    <Link href="/terminal" className="flex items-center gap-3 px-4 py-2 hover:opacity-80 rounded-lg transition-all"
                        style={{ color: 'var(--foreground)' }}>
                        <Terminal className="w-5 h-5" />
                        Terminal
                    </Link>
                    <Link href="/processes" className="flex items-center gap-3 px-4 py-2 hover:opacity-80 rounded-lg transition-all"
                        style={{ color: 'var(--foreground)' }}>
                        <Monitor className="w-5 h-5" />
                        Processes
                    </Link>
                </nav>

                <div className="p-4 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
                    <Link href="/settings" className="flex items-center gap-3 px-4 py-2 hover:opacity-80 rounded-lg transition-all"
                        style={{ color: 'var(--foreground)' }}>
                        <Settings className="w-5 h-5" />
                        Settings
                    </Link>
                    <div onClick={handleLogout} className="flex items-center gap-3 px-4 py-2 text-red-500 hover:bg-red-50 hover:bg-opacity-10 rounded-lg cursor-pointer transition-all font-medium">
                        <LogOut className="w-5 h-5" />
                        Logout
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-y-auto">
                <header className="h-16 border-b flex items-center justify-between px-8 shadow-sm"
                    style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2">
                        <span className="opacity-50">Pages</span>
                        <span className="opacity-50">/</span>
                        <span className="font-medium">Dashboard</span>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Theme Switcher Quick Menu */}
                        <div className="flex items-center gap-2 p-1 rounded-full px-3" style={{ backgroundColor: 'var(--secondary)' }}>
                            <Palette className="w-4 h-4 opacity-50" />
                            <select
                                value={theme.id}
                                onChange={(e) => setTheme(e.target.value)}
                                className="bg-transparent text-xs font-bold outline-none border-none cursor-pointer"
                                style={{ color: 'var(--foreground)' }}
                            >
                                {availableThemes.map(t => (
                                    <option key={t.id} value={t.id} className="bg-gray-800 text-white">{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-4 border-l pl-6" style={{ borderColor: 'var(--border)' }}>
                            <div className="text-sm text-right">
                                <p className="font-bold">{username}</p>
                                <p className="text-xs opacity-50 capitalize">Administrator</p>
                            </div>
                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold border-2"
                                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--ring)' }}>
                                {username[0].toUpperCase()}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="p-8">
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold">Welcome Back</h2>
                        <p className="opacity-60">System metrics and module activity overview.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { label: 'CPU Usage', value: '12%', color: 'var(--primary)' },
                            { label: 'Memory', value: '2.4 GB', color: 'var(--accent)' },
                            { label: 'Active Sessions', value: '3', color: 'var(--primary)' },
                            { label: 'System Uptime', value: '12d 4h', color: 'var(--destructive)' },
                        ].map((widget, i) => (
                            <div key={i} className="p-6 rounded-2xl shadow-sm border flex flex-col justify-between"
                                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                                <span className="text-sm font-semibold opacity-40 uppercase tracking-wider">{widget.label}</span>
                                <div className="mt-2 flex items-baseline justify-between">
                                    <span className="text-2xl font-bold" style={{ color: widget.color }}>{widget.value}</span>
                                    <div className="p-2 rounded-lg" style={{ backgroundColor: widget.color, opacity: 0.15 }}>
                                        <Monitor className="w-5 h-5" style={{ color: widget.color, opacity: 1 }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8">
                        <h2 className="text-xl font-bold mb-4 opacity-70">Real-time Analytics</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {renderWidget('CPUChartWidget')}
                            {renderWidget('MemoryChartWidget')}
                        </div>
                    </div>

                    <div className="mt-8">
                        <h3 className="text-xl font-bold mb-4 opacity-70">Module Diagnostics</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {registeredWidgets.filter(w => !['CPUChartWidget', 'MemoryChartWidget'].includes(w.component)).map(w => (
                                <React.Fragment key={w.id}>
                                    {renderWidget(w.component)}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8 border p-8 rounded-3xl text-center"
                        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                        <div className="max-w-md mx-auto space-y-4">
                            <Shield className="w-12 h-12 mx-auto" style={{ color: 'var(--primary)' }} />
                            <h3 className="text-xl font-bold italic" style={{ color: 'var(--primary)' }}>Theme Engine Active</h3>
                            <p className="text-sm opacity-70">
                                You are currently viewing the system in **{theme.name}** mode. All modules integrated via the Module Registration system will automatically inherit these properties.
                            </p>
                            <div className="flex flex-wrap justify-center gap-2 mt-4">
                                {availableThemes.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTheme(t.id)}
                                        className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${theme.id === t.id ? 'scale-125' : ''}`}
                                        style={{ backgroundColor: t.colors.background, borderColor: t.colors.primary }}
                                        title={t.name}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
