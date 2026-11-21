'use client';

import ProShell from '@/components/layout/ProShell';
import FirewallPage from '@/modules/firewall/ui/FirewallPage';

export default function FirewallRoute() {
  return (
    <ProShell title="Firewall" subtitle="Host firewall posture, policies, and exposure checks">
      <FirewallPage />
    </ProShell>
  );
}
