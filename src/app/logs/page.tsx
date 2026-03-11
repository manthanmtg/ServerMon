'use client';

import LogsPage from '@/modules/logs/ui/LogsPage';
import ProShell from '@/components/layout/ProShell';
import { Activity } from 'lucide-react';

export default function Page() {
    return (
        <ProShell title="Audit Logs" subtitle="System History">
            <div className="glass rounded-[2rem] overflow-hidden p-8 lg:p-12 animate-fade-in shadow-2xl">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-emerald-500/10 rounded-2xl">
                        <Activity className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight">Kernel Events</h3>
                        <p className="text-sm text-slate-500 font-medium">Monitoring all system-level operations and security hooks.</p>
                    </div>
                </div>
                <LogsPage />
            </div>
        </ProShell>
    );
}
