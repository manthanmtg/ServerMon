'use client';

import ProcessWidget from '@/modules/processes/ui/ProcessWidget';
import ProShell from '@/components/layout/ProShell';

export default function Page() {
  return (
    <ProShell title="Processes" subtitle="System Processes">
      <div className="animate-fade-in">
        <ProcessWidget />
      </div>
    </ProShell>
  );
}
