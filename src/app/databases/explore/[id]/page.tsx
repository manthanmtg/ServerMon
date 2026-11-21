'use client';

import { useParams } from 'next/navigation';
import ProShell from '@/components/layout/ProShell';
import DatabasesExplorerPage from '@/modules/databases/ui/DatabasesExplorerPage';

export default function DatabaseExploreRoute() {
  const params = useParams<{ id: string }>();

  return (
    <ProShell title="Database Explorer" subtitle="Explore a managed database through ServerMon">
      <DatabasesExplorerPage databaseId={params.id} />
    </ProShell>
  );
}
