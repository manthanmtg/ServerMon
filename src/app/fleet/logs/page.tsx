'use client';
import ProShell from '@/components/layout/ProShell';
import { FleetLogsPage } from '@/modules/fleet/ui/operations/FleetLogsPage';

export default function FleetLogsRoutePage() {
  return (
    <ProShell title="Fleet" subtitle="Logs">
      <FleetLogsPage />
    </ProShell>
  );
}
