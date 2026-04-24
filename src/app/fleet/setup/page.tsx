'use client';
import ProShell from '@/components/layout/ProShell';
import { IngressSetupWizard } from '@/modules/fleet/ui/operations/IngressSetupWizard';

export default function Page() {
  return (
    <ProShell title="Hub Setup" subtitle="Configure cloud ingress for fleet management">
      <div className="max-w-4xl">
        <IngressSetupWizard />
      </div>
    </ProShell>
  );
}
