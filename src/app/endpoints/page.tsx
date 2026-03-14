import ProShell from '@/components/layout/ProShell';
import EndpointsPage from '@/modules/endpoints/ui/EndpointsPage';

export default function EndpointsRoute() {
    return (
        <ProShell title="Endpoints" subtitle="Custom API Builder">
            <EndpointsPage />
        </ProShell>
    );
}
