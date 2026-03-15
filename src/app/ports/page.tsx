'use client';

import ProShell from '@/components/layout/ProShell';
import PortsPage from '@/modules/ports/ui/PortsPage';

export default function PortsRoute() {
  return (
    <ProShell title="Ports Monitor" subtitle="Listening Ports, Availability & Firewall">
      <PortsPage />
    </ProShell>
  );
}
