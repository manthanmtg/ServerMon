'use client';
import ProShell from '@/components/layout/ProShell';
import { ConfigImportWizard } from '@/modules/fleet/ui/operations/ConfigImportWizard';

export default function FleetImportPage() {
  return (
    <ProShell title="Fleet" subtitle="Import configuration">
      <ConfigImportWizard />
    </ProShell>
  );
}
