'use client';

import ProShell from '@/components/layout/ProShell';
import AIAgentsPage from '@/modules/ai-agents/ui/AIAgentsPage';

export default function AIAgentsRoute() {
    return (
        <ProShell title="AI Agents" subtitle="Monitor and Manage AI Coding Agents">
            <AIAgentsPage />
        </ProShell>
    );
}
