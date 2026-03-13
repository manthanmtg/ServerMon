'use client';

import ProShell from '@/components/layout/ProShell';
import HardwarePage from '@/modules/hardware/ui/HardwarePage';

export default function HardwareRoute() {
    return (
        <ProShell title="Hardware Info" subtitle="System Specifications & Sensors">
            <HardwarePage />
        </ProShell>
    );
}
