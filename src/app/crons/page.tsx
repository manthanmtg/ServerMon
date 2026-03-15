'use client';

import ProShell from '@/components/layout/ProShell';
import CronsPage from '@/modules/crons/ui/CronsPage';

export default function CronsRoute() {
  return (
    <ProShell title="Cron Jobs" subtitle="Schedules, Execution History, and Management">
      <CronsPage />
    </ProShell>
  );
}
