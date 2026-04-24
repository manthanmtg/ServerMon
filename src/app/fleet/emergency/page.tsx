'use client';
import ProShell from '@/components/layout/ProShell';
import { EmergencyControls } from '@/modules/fleet/ui/operations/EmergencyControls';
import { FleetAlertsPanel } from '@/modules/fleet/ui/operations/FleetAlertsPanel';

export default function FleetEmergencyPage() {
  return (
    <ProShell title="Fleet" subtitle="Emergency controls">
      <div className="space-y-4">
        <FleetAlertsPanel />
        <EmergencyControls />
      </div>
    </ProShell>
  );
}
