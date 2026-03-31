'use client';

import ProShell from '@/components/layout/ProShell';
import SelfServicePage from '@/modules/self-service/ui/SelfServicePage';

export default function SelfServiceRoute() {
  return (
    <ProShell title="Self Service" subtitle="Browse, install, and manage services and tools">
      <SelfServicePage />
    </ProShell>
  );
}
