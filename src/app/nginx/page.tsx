'use client';

import ProShell from '@/components/layout/ProShell';
import NginxPage from '@/modules/nginx/ui/NginxPage';

export default function NginxRoute() {
  return (
    <ProShell title="Nginx Manager" subtitle="Reverse Proxy & Virtual Hosts">
      <NginxPage />
    </ProShell>
  );
}
