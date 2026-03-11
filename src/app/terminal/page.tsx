'use client';

import TerminalPage from '@/modules/terminal/ui/TerminalPage';
import ProShell from '@/components/layout/ProShell';

export default function Page() {
    return (
        <ProShell title="Terminal" subtitle="Remote Execution">
            <div className="glass rounded-[2rem] overflow-hidden p-6 lg:p-10 h-[calc(100vh-200px)] min-h-[600px] animate-fade-in shadow-2xl">
                <TerminalPage />
            </div>
        </ProShell>
    );
}
