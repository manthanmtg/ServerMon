import ProShell from '@/components/layout/ProShell';
import UserGuidePage from '@/modules/guide/ui/UserGuidePage';

export const metadata = {
    title: 'User Guide | ServerMon',
    description: 'ServerMon Knowledge Center and Module Guides',
};

export default function GuidePageRoute() {
    return (
        <ProShell title="User Guide" subtitle="Knowledge Center">
            <UserGuidePage />
        </ProShell>
    );
}
