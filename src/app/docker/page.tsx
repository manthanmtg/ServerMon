'use client';

import ProShell from '@/components/layout/ProShell';
import DockerPage from '@/modules/docker/ui/DockerPage';

export default function DockerRoute() {
    return (
        <ProShell title="Docker Monitor" subtitle="Containers, Images, and Runtime Health">
            <DockerPage />
        </ProShell>
    );
}
