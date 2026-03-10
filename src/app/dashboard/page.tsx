import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { Shield, LayoutDashboard, Monitor, Terminal, Settings, LogOut } from 'lucide-react';
import Link from 'next/link';

export default async function DashboardPage() {
    const session = await getSession();

    // Extra security check (redundant with middleware but safe)
    if (!session) {
        redirect('/login');
    }

    return (
        <div className="min-h-screen flex bg-gray-50">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r flex flex-col shadow-sm">
                <div className="p-6 border-b flex items-center gap-2">
                    <Shield className="w-8 h-8 text-blue-600" />
                    <h1 className="text-xl font-bold tracking-tight italic">ServerMon</h1>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg font-medium">
                        <LayoutDashboard className="w-5 h-5" />
                        Dashboard
                    </Link>
                    <div className="pt-4 pb-2 px-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Modules
                    </div>
                    <Link href="/terminal" className="flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <Terminal className="w-5 h-5" />
                        Terminal
                    </Link>
                    <Link href="/processes" className="flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <Monitor className="w-5 h-5" />
                        Processes
                    </Link>
                </nav>

                <div className="p-4 border-t space-y-1">
                    <Link href="/settings" className="flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <Settings className="w-5 h-5" />
                        Settings
                    </Link>
                    {/* Logout would be an API call / server action */}
                    <div className="flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors font-medium">
                        <LogOut className="w-5 h-5" />
                        Logout
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                <header className="h-16 bg-white border-b flex items-center justify-between px-8 shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">Pages</span>
                        <span className="text-gray-400">/</span>
                        <span className="font-medium">Dashboard</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-right">
                            <p className="font-bold text-gray-800">{session.user.username}</p>
                            <p className="text-xs text-gray-500 capitalize">{session.user.role}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold border-2 border-blue-200">
                            {session.user.username[0].toUpperCase()}
                        </div>
                    </div>
                </header>

                <div className="p-8">
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold text-gray-800">Welcome Back</h2>
                        <p className="text-gray-500">System metrics and module activity overview.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Initial Placeholder Widgets */}
                        {[
                            { label: 'CPU Usage', value: '12%', color: 'text-blue-600', bg: 'bg-blue-100' },
                            { label: 'Memory', value: '2.4 GB', color: 'text-green-600', bg: 'bg-green-100' },
                            { label: 'Active Sessions', value: '3', color: 'text-purple-600', bg: 'bg-purple-100' },
                            { label: 'System Uptime', value: '12d 4h', color: 'text-orange-600', bg: 'bg-orange-100' },
                        ].map((widget, i) => (
                            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                                <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{widget.label}</span>
                                <div className="mt-2 flex items-baseline justify-between">
                                    <span className={`text-2xl font-bold ${widget.color}`}>{widget.value}</span>
                                    <div className={`p-2 rounded-lg ${widget.bg} opacity-50`}>
                                        <Monitor className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 bg-blue-50 border border-blue-100 p-8 rounded-3xl text-center">
                        <div className="max-w-md mx-auto space-y-4">
                            <Shield className="w-12 h-12 text-blue-600 mx-auto" />
                            <h3 className="text-xl font-bold text-blue-900 italic">Foundation Phase Complete</h3>
                            <p className="text-blue-700 text-sm">
                                Next, we will implement the **Extensible Theme System** to allow VS Code-style customization across all modules.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
