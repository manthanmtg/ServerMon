'use client';
import ProShell from '@/components/layout/ProShell';
import { TroubleshootingAssistant } from '@/modules/fleet/ui/operations/TroubleshootingAssistant';
import { PreflightReport } from '@/modules/fleet/ui/operations/PreflightReport';

export default function FleetDiagnosticsPage() {
  return (
    <ProShell title="Fleet" subtitle="Diagnostics">
      <div className="space-y-4">
        <TroubleshootingAssistant />
        <PreflightReport />
      </div>
    </ProShell>
  );
}
