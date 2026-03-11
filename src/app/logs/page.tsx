'use client';

import LogsPage from '@/modules/logs/ui/LogsPage';
import ProShell from '@/components/layout/ProShell';

export const dynamic = 'force-dynamic';

export default function Page() {
    return (
        <ProShell title="Audit Logs" subtitle="Event History">
            <div className="animate-fade-in">
                <LogsPage />
            </div>
        </ProShell>
    );
}
