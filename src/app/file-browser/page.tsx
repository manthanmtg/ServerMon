'use client';

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
                <FileBrowserPage />
            </div>
        </ProShell>
    );
}
