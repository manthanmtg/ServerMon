'use client';
import ProShell from '@/components/layout/ProShell';
import { RouteTemplatePicker } from '@/modules/fleet/ui/operations/RouteTemplatePicker';

export default function FleetTemplatesPage() {
  return (
    <ProShell title="Fleet" subtitle="Route templates">
      <RouteTemplatePicker />
    </ProShell>
  );
}
