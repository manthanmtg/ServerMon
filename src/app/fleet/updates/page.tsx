'use client';
import ProShell from '@/components/layout/ProShell';
import { AgentUpdateCenter } from '@/modules/fleet/ui/operations/AgentUpdateCenter';

export default function FleetUpdatesPage() {
  return (
    <ProShell title="Fleet" subtitle="Agent updates">
      <AgentUpdateCenter />
    </ProShell>
  );
}
