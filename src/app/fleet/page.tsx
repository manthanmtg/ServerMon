'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import ProShell from '@/components/layout/ProShell';
import { Button } from '@/components/ui/button';
import { FleetStatsBanner } from '@/modules/fleet/ui/dashboard/FleetStatsBanner';
import { NodeSearch, type NodeSearchValue } from '@/modules/fleet/ui/dashboard/NodeSearch';
import { NodeGrid } from '@/modules/fleet/ui/dashboard/NodeGrid';
import { Plus } from 'lucide-react';

export default function FleetPage() {
  const [filter, setFilter] = useState<NodeSearchValue>({
    search: '',
    tag: '',
    status: '',
  });
  const onChange = useCallback((v: NodeSearchValue) => setFilter(v), []);
  return (
    <ProShell title="Fleet" subtitle="Manage remote agents and public routes">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <FleetStatsBanner />
          </div>
          <Link href="/fleet/onboarding">
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Onboard agent
            </Button>
          </Link>
        </div>
        <NodeSearch onChange={onChange} />
        <NodeGrid search={filter.search} tag={filter.tag} status={filter.status} />
      </div>
    </ProShell>
  );
}
