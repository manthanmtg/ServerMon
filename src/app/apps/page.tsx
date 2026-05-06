'use client';

import ProShell from '@/components/layout/ProShell';
import AppsPage from '@/modules/apps/ui/AppsPage';

export default function AppsRoute() {
  return (
    <ProShell title="Apps" subtitle="Deploy local Next.js apps with managed releases">
      <AppsPage />
    </ProShell>
  );
}
