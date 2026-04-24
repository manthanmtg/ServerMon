'use client';
import ProShell from '@/components/layout/ProShell';
import { FrpServerControl } from '@/modules/fleet/ui/operations/FrpServerControl';
import { PreflightReport } from '@/modules/fleet/ui/operations/PreflightReport';

export default function FleetServerPage() {
  return (
    <ProShell title="Fleet" subtitle="FRP server">
      <div className="space-y-4">
        <FrpServerControl />
        <PreflightReport />
      </div>
    </ProShell>
  );
}
