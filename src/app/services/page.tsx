'use client';

import ProShell from '@/components/layout/ProShell';
import ServicesPage from '@/modules/services/ui/ServicesPage';

export default function ServicesRoute() {
    return (
        <ProShell title="Services Monitor" subtitle="Systemd Services, Timers, and Alerts">
            <ServicesPage />
        </ProShell>
    );
}
