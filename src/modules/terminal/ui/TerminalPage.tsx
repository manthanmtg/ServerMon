'use client';

import React from 'react';
import TerminalUI from './TerminalUI';
import { Shield, Terminal as TerminalIcon, Home, Settings } from 'lucide-react';
import Link from 'next/link';

export default function TerminalPage() {

    const handleTerminalData = (data: string) => {
        // Basic terminal feedback for demonstration
        // In a real implementation, this would send data to the backend pty
        console.log('Terminal data:', data);
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
                    <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2 hover:opacity-80 rounded-lg transition-all"
                        style={{ color: 'var(--foreground)' }}>
                        <Home className="w-5 h-5" />
                        Dashboard
                    </Link>
                    <Link href="/terminal" className="flex items-center gap-3 px-4 py-2 rounded-lg font-medium"
                        style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                        <TerminalIcon className="w-5 h-5" />
                        Terminal
                    </Link>
                </nav>

                <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <Link href="/settings" className="flex items-center gap-3 px-4 py-2 hover:opacity-80 rounded-lg transition-all"
                        style={{ color: 'var(--foreground)' }}>
                        <Settings className="w-5 h-5" />
                        Settings
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 border-b flex items-center justify-between px-8 shadow-sm"
                    style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2">
                        <span className="opacity-50">Tools</span>
                        <span className="opacity-50">/</span>
                        <span className="font-medium">Terminal</span>
                    </div>
                    <div className="text-xs font-mono opacity-50 px-3 py-1 rounded bg-secondary" style={{ backgroundColor: 'var(--secondary)' }}>
                        session_id: sm-term-01
                    </div>
                </header>

                <div className="flex-1 p-8 bg-black bg-opacity-5">
                    <div className="h-full rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
                        <div className="h-8 border-b flex items-center px-4 gap-2" style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}>
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                            <span className="ml-2 text-[10px] font-bold opacity-50">bash — 80x24</span>
                        </div>
                        <div className="flex-1">
                            <TerminalUI onData={handleTerminalData} />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
