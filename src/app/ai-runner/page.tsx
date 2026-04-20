export const dynamic = 'force-dynamic';

import ProShell from '@/components/layout/ProShell';
import AIRunnerPage from '@/modules/ai-runner/ui/AIRunnerPage';

export default function AIRunnerRoute() {
  return (
    <ProShell title="AI Runner" subtitle="Execute, Schedule, and Audit AI Agent Runs">
      <AIRunnerPage />
    </ProShell>
  );
}
