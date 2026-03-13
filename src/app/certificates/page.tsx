'use client';

import ProShell from '@/components/layout/ProShell';
import CertificatesPage from '@/modules/certificates/ui/CertificatesPage';

export default function CertificatesRoute() {
    return (
        <ProShell title="Certificates" subtitle="SSL/TLS Certificate Management">
            <CertificatesPage />
        </ProShell>
    );
}
