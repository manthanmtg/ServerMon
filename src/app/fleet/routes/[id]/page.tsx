'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ProShell from '@/components/layout/ProShell';
import { Spinner } from '@/components/ui/spinner';
import { GeneratedDocsView } from '@/modules/fleet/ui/operations/GeneratedDocsView';
import { ConfigRevisionHistory } from '@/modules/fleet/ui/operations/ConfigRevisionHistory';

interface RouteSummary {
  _id: string;
  name: string;
  slug: string;
  domain: string;
}

export default function FleetRouteDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/fleet/routes/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const r = data.route ?? data;
        setRoute({
          _id: String(r._id),
          name: r.name,
          slug: r.slug,
          domain: r.domain,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <ProShell title="Fleet" subtitle="Public route">
        <div className="text-sm text-destructive">{error}</div>
      </ProShell>
    );
  }

  if (!route) {
    return (
      <ProShell title="Fleet" subtitle="Public route">
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </ProShell>
    );
  }

  return (
    <ProShell title={route.name} subtitle={route.domain}>
      <div className="space-y-4">
        <GeneratedDocsView kind="route" routeId={route._id} />
        <ConfigRevisionHistory defaultKind="nginx" defaultTargetId={route._id} lockFilters />
      </div>
    </ProShell>
  );
}
