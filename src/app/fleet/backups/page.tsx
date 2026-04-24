'use client';
import ProShell from '@/components/layout/ProShell';
import { BackupRestorePanel } from '@/modules/fleet/ui/operations/BackupRestorePanel';

export default function FleetBackupsPage() {
  return (
    <ProShell title="Fleet" subtitle="Backups">
      <BackupRestorePanel />
    </ProShell>
  );
}
