'use client';

import ProShell from '@/components/layout/ProShell';
import DatabasesPage from '@/modules/databases/ui/DatabasesPage';

export default function DatabasesRoute() {
  return (
    <ProShell title="Databases" subtitle="Deploy and operate Docker-based databases">
      <DatabasesPage />
    </ProShell>
  );
}
