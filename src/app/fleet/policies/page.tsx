'use client';
import { useState } from 'react';
import ProShell from '@/components/layout/ProShell';
import { AccessPolicyEditor } from '@/modules/fleet/ui/operations/AccessPolicyEditor';
import { ResourceGuardSettings } from '@/modules/fleet/ui/operations/ResourceGuardSettings';
import { cn } from '@/lib/utils';

type Tab = 'access' | 'resources';

export default function FleetPoliciesPage() {
  const [tab, setTab] = useState<Tab>('access');
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'access', label: 'Access policies' },
    { id: 'resources', label: 'Resource guards' },
  ];

  return (
    <ProShell title="Fleet" subtitle="Policies">
      <div className="space-y-4">
        <div role="tablist" aria-label="Policy views" className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`fleet-policy-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={`fleet-policy-tabpanel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                tab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          id="fleet-policy-tabpanel-access"
          role="tabpanel"
          aria-labelledby="fleet-policy-tab-access"
          hidden={tab !== 'access'}
        >
          <AccessPolicyEditor />
        </div>
        <div
          id="fleet-policy-tabpanel-resources"
          role="tabpanel"
          aria-labelledby="fleet-policy-tab-resources"
          hidden={tab !== 'resources'}
        >
          <ResourceGuardSettings />
        </div>
      </div>
    </ProShell>
  );
}
