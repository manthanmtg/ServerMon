'use client';
import ProShell from '@/components/layout/ProShell';
import { FleetEndpointRunner } from '@/modules/fleet/ui/operations/FleetEndpointRunner';

export default function FleetEndpointRunnerPage() {
  return (
    <ProShell title="Fleet Endpoint Runner">
      <FleetEndpointRunner />
    </ProShell>
  );
}
