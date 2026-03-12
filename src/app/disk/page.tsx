'use client';

import ProShell from '@/components/layout/ProShell';
import DiskPage from '@/modules/disk/ui/DiskPage';
import { MetricsProvider } from '@/lib/MetricsContext';

export default function DiskRoute() {
    return (
        <ProShell title="Disk Monitor" subtitle="Storage and I/O Performance">
            <MetricsProvider>
                <DiskPage />
            </MetricsProvider>
        </ProShell>
    );
}
