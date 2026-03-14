'use client';

import MemoryPage from '@/modules/memory/ui/MemoryPage';
import { MetricsProvider } from '@/lib/MetricsContext';

export default function Page() {
    return (
        <MetricsProvider>
            <MemoryPage />
        </MetricsProvider>
    );
}
