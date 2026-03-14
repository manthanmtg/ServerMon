export const dynamic = 'force-dynamic';

import ProShell from '@/components/layout/ProShell';
import NetworkPage from '@/modules/network/ui/NetworkPage';

export const metadata = {
    title: 'Network Monitor | ServerMon',
};

export default function Page() {
    return (
        <ProShell title="Network Monitor" subtitle="Real-time traffic and connection analysis">
            <NetworkPage />
        </ProShell>
    );
}
