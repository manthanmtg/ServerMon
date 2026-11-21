'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, LoaderCircle, RefreshCw, Square, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ManagedDatabaseDTO } from '../types';

interface DatabasesExplorerPageProps {
  databaseId: string;
}

type ExplorerState = ManagedDatabaseDTO['explorer'];

export default function DatabasesExplorerPage({ databaseId }: DatabasesExplorerPageProps) {
  const router = useRouter();
  const [explorer, setExplorer] = useState<ExplorerState | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function startExplorer() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/modules/databases/${databaseId}/explore`, {
          method: 'POST',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to open database explorer');
        if (mounted) setExplorer(data.explorer);
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to open database explorer');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    startExplorer();
    return () => {
      mounted = false;
    };
  }, [databaseId]);

  const stopExplorer = async () => {
    setStopping(true);
    setError(null);
    try {
      const response = await fetch(`/api/modules/databases/${databaseId}/explore`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to stop database explorer');
      setExplorer(data.explorer);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to stop database explorer');
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col gap-4">
      <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-normal">Database Explorer</h2>
            {explorer && <Badge variant="secondary">{explorer.kind}</Badge>}
            {explorer?.status === 'running' && <Badge variant="success">running</Badge>}
            {loading && (
              <Badge variant="warning">
                <LoaderCircle className="h-3 w-3 animate-spin" />
                opening
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            ServerMon starts a local-only explorer sidecar and proxies it through this authenticated
            page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/databases')}>
            <ArrowLeft className="h-4 w-4" />
            Databases
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFrameKey((value) => value + 1)}
            disabled={!explorer?.proxyPath}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={stopExplorer}
            loading={stopping}
            disabled={!explorer || explorer.status === 'stopped'}
          >
            <Square className="h-4 w-4" />
            Stop explorer
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[520px] flex-1 items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          Opening explorer
        </div>
      ) : explorer?.proxyPath ? (
        <iframe
          key={frameKey}
          title="Database explorer"
          src={explorer.proxyPath}
          className="min-h-[620px] flex-1 rounded-lg border border-border bg-background"
        />
      ) : (
        <div className="flex min-h-[520px] flex-1 items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
          Explorer is not running.
        </div>
      )}
    </div>
  );
}
