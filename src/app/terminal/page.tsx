'use client';

import TerminalPage from '@/modules/terminal/ui/TerminalPage';
import ProShell from '@/components/layout/ProShell';

export default function Page() {
    return (
        <ProShell title="Terminal" subtitle="Remote Shell">
            <div className="h-[calc(100vh-140px)] min-h-[500px] animate-fade-in">
                <TerminalPage />
            </div>
        </ProShell>
    );
}
