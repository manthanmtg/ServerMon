'use client';

import LogsPage from '@/modules/logs/ui/LogsPage';
import ProShell from '@/components/layout/ProShell';

export default function Page() {
    return (
        <ProShell title="Audit Logs" subtitle="System History">
            <div className="mb-10 animate-slide-up">
                <h2 className="text-4xl font-black text-white font-['Outfit'] tracking-tight">Kernel <span className="text-gradient">Activity</span></h2>
                <p className="text-slate-400 mt-2 font-medium">Monitoring all system-level operations and security hooks.</p>
            </div>

            <LogsPage />
        </ProShell>
    );
}
