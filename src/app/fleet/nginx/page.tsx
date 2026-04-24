'use client';
import ProShell from '@/components/layout/ProShell';
import { NginxManager } from '@/modules/fleet/ui/operations/NginxManager';
import { CertificateManager } from '@/modules/fleet/ui/operations/CertificateManager';

export default function FleetNginxPage() {
  return (
    <ProShell title="Fleet" subtitle="Nginx & certificates">
      <div className="space-y-4">
        <NginxManager />
        <CertificateManager />
      </div>
    </ProShell>
  );
}
