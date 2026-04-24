'use client';
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProShell from '@/components/layout/ProShell';
import { Button } from '@/components/ui/button';
import { FleetStatsBanner } from '@/modules/fleet/ui/dashboard/FleetStatsBanner';
import { NodeSearch, type NodeSearchValue } from '@/modules/fleet/ui/dashboard/NodeSearch';
import { NodeGrid } from '@/modules/fleet/ui/dashboard/NodeGrid';
import { Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

export default function FleetPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NodeSearchValue>({
    search: '',
    tag: '',
    status: '',
  });

  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch('/api/fleet/server');
        if (res.ok) {
          const data = await res.json();
          // If not enabled or no subdomain host, go to setup
          if (!data.state?.enabled || !data.state?.subdomainHost) {
            router.replace('/fleet/setup');
            return;
          }
        }
      } catch (err) {
        console.error('Failed to check fleet setup state', err);
      } finally {
        setLoading(false);
      }
    }
    checkSetup();
  }, [router]);

  const onChange = useCallback((v: NodeSearchValue) => setFilter(v), []);

  if (loading) {
    return (
      <ProShell title="Fleet" subtitle="Loading...">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Spinner size="lg" />
          <p className="mt-4 text-muted-foreground">Checking hub configuration...</p>
        </div>
      </ProShell>
    );
  }

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
