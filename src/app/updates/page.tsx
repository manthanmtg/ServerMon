'use client';

import React from 'react';
import ProShell from '@/components/layout/ProShell';
import UpdatePage from '@/modules/updates/ui/UpdatePage';

export default function UpdatesPageRoute() {
    return (
        <ProShell title="System Updates">
            <UpdatePage />
        </ProShell>
    );
}
