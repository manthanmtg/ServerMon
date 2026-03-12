'use client';

import React, { Suspense } from 'react';
import ProShell from '@/components/layout/ProShell';
import FileBrowserPage, { FileBrowserHeaderShortcuts } from '@/modules/file-browser/ui/FileBrowserPage';

export default function Page() {
    return (
        <ProShell
            title="File Browser"
            subtitle="Secure Server Files"
            headerContent={<FileBrowserHeaderShortcuts />}
        >
            <div className="h-[calc(100dvh-140px)] min-h-[560px] animate-fade-in">
                <Suspense fallback={<div className="flex h-full items-center justify-center">Loading...</div>}>
                    <FileBrowserPage />
                </Suspense>
            </div>
        </ProShell>
    );
}
