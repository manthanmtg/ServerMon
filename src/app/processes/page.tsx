'use client';

import ProcessWidget from '@/modules/processes/ui/ProcessWidget';
import ProShell from '@/components/layout/ProShell';

export default function Page() {
    return (
        <ProShell title="Processes" subtitle="Real-time Orchestration">
            <div className="animate-fade-in shadow-2xl">
                <ProcessWidget />
            </div>
        </ProShell>
    );
}
