'use client';

import ProShell from '@/components/layout/ProShell';
import SecurityPage from '@/modules/security/ui/SecurityPage';

export default function SecurityRoute() {
  return (
    <ProShell title="Security Audit" subtitle="Posture Dashboard & Vulnerability Scanning">
      <SecurityPage />
    </ProShell>
  );
}
