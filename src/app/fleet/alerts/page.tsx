'use client';
import ProShell from '@/components/layout/ProShell';
import { AlertChannelManager } from '@/modules/fleet/ui/operations/AlertChannelManager';

export default function FleetAlertsPage() {
  return (
    <ProShell title="Fleet" subtitle="Alerts">
      <AlertChannelManager />
    </ProShell>
  );
}
