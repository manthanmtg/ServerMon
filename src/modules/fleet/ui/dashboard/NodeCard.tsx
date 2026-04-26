'use client';
import { memo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { deriveNodeStatus, deriveNodeTransition, lastSeenLabel } from '@/lib/fleet/status';
import { cn } from '@/lib/utils';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useToast } from '@/components/ui/toast';

export interface NodeCardData {
  _id: string;
  name: string;
  slug: string;
  status: string;
  tunnelStatus: string;
  tags: string[];
  lastSeen?: string;
  lastBootAt?: string;
  agentVersion?: string;
  frpcVersion?: string;
  pairingVerifiedAt?: string | null;
  maintenance?: { enabled: boolean; reason?: string };
  proxyRules?: Array<{ name: string; status: string; enabled: boolean }>;
  metrics?: { cpuLoad?: number; ramUsed?: number; uptime?: number };
}

const STATUS_STYLES: Record<string, string> = {
  online:
    'bg-[color:var(--success,#16a34a)]/10 text-[color:var(--success,#16a34a)] border-[color:var(--success,#16a34a)]/30',
  offline: 'bg-destructive/10 text-destructive border-destructive/30',
  connecting: 'bg-primary/10 text-primary border-primary/30',
  degraded:
    'bg-[color:var(--warning,#d97706)]/10 text-[color:var(--warning,#d97706)] border-[color:var(--warning,#d97706)]/30',
  maintenance: 'bg-muted text-muted-foreground border-border',
  disabled: 'bg-muted text-muted-foreground border-border',
  unpaired: 'bg-primary/10 text-primary border-primary/30',
  error: 'bg-destructive/10 text-destructive border-destructive/30',
};

export const NodeCard = memo(function NodeCard({
  node,
  now = new Date(),
  onDelete,
}: {
  node: NodeCardData;
  now?: Date;
  onDelete?: () => void;
}) {
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const status = deriveNodeStatus({
    lastSeen: node.lastSeen ? new Date(node.lastSeen) : undefined,
    tunnelStatus: node.tunnelStatus as never,
    maintenanceEnabled: node.maintenance?.enabled,
    unpaired: !node.pairingVerifiedAt,
    now,
  });
  const transition = deriveNodeTransition({
    lastBootAt: node.lastBootAt ? new Date(node.lastBootAt) : undefined,
    lastSeen: node.lastSeen ? new Date(node.lastSeen) : undefined,
    tunnelStatus: node.tunnelStatus as never,
    proxyRules: node.proxyRules,
    now,
  });
  const proxySummary = (node.proxyRules ?? []).length
    ? `${(node.proxyRules ?? []).filter((p) => p.enabled).length} proxies`
    : 'No proxies';

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/fleet/nodes/${node._id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete node');
      }
      toast({
        title: 'Node Deleted',
        description: `Agent "${node.name}" has been removed.`,
        variant: 'success',
      });
      onDelete?.();
    } catch (err) {
      toast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <Card className="transition-colors hover:border-primary/40 group relative">
        <Link href={`/fleet/${node.slug}`} className="absolute inset-0 z-0" />
        <CardHeader className="flex flex-row items-start justify-between pb-2 relative z-10 pointer-events-none">
          <div>
            <CardTitle className="text-base">{node.name}</CardTitle>
            <div className="text-xs text-muted-foreground font-mono">{node.slug}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <span
                className={cn('text-xs px-2 py-0.5 rounded-full border', STATUS_STYLES[status])}
              >
                {status}
              </span>
              {transition && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 animate-pulse">
                  {transition.replace('_', ' ')}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive pointer-events-auto mt-1"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              title="Delete Node"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm relative z-10 pointer-events-none">
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>Last seen</span>
            <span>{lastSeenLabel(node.lastSeen ? new Date(node.lastSeen) : undefined, now)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>Agent</span>
            <span className="font-mono">{node.agentVersion ?? '—'}</span>
          </div>
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>FRPC</span>
            <span className="font-mono">{node.frpcVersion ?? '—'}</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {node.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
          <div className="text-xs text-muted-foreground pt-1 border-t border-border">
            {proxySummary}
          </div>
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Node"
        message={`Are you sure you want to delete the agent "${node.name}"? This action cannot be undone and will disconnect the agent from the fleet.`}
        verificationText={node.slug}
        confirmLabel="Delete Agent"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
});
