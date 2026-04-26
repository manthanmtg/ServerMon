'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Download, History, RefreshCcw, ServerCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { ServermonAgentStatus } from '@/types/updates';

type ServiceUpdateType = 'servermon' | 'agent';

const UPDATE_COPY: Record<
  ServiceUpdateType,
  { title: string; message: string; toastTitle: string; toastDescription: string }
> = {
  servermon: {
    title: 'Update ServerMon App',
    message:
      'This will run the ServerMon self-update script and may restart this ServerMon app while the update completes.',
    toastTitle: 'ServerMon update started',
    toastDescription: 'The app update is running in the background.',
  },
  agent: {
    title: 'Update ServerMon Agent',
    message:
      'This will pull, build, and restart the colocated servermon-agent service. The ServerMon app will stay running while the agent updates.',
    toastTitle: 'Agent update started',
    toastDescription: 'The colocated Fleet agent update is running in the background.',
  },
};

interface ServerMonServicesCardProps {
  onOpenHistory: () => void;
}

export default function ServerMonServicesCard({ onOpenHistory }: ServerMonServicesCardProps) {
  const { toast } = useToast();
  const [agentStatus, setAgentStatus] = useState<ServermonAgentStatus | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [updating, setUpdating] = useState<ServiceUpdateType | null>(null);
  const [confirmType, setConfirmType] = useState<ServiceUpdateType | null>(null);

  const loadAgentStatus = useCallback(async () => {
    setAgentLoading(true);
    try {
      const res = await fetch('/api/modules/updates/agent');
      if (!res.ok) return;
      const data = (await res.json()) as { agent?: ServermonAgentStatus };
      setAgentStatus(data.agent ?? null);
    } catch {
      setAgentStatus(null);
    } finally {
      setAgentLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgentStatus();
  }, [loadAgentStatus]);

  const handleConfirmUpdate = async () => {
    if (!confirmType) return;

    const type = confirmType;
    setConfirmType(null);
    setUpdating(type);

    try {
      const res = await fetch('/api/modules/updates/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to trigger update');
      }

      toast({
        title: UPDATE_COPY[type].toastTitle,
        description: data.runId
          ? `${UPDATE_COPY[type].toastDescription} Run ID: ${data.runId}`
          : UPDATE_COPY[type].toastDescription,
        variant: 'success',
      });

      if (type === 'agent') void loadAgentStatus();
    } catch (error) {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  const copy = confirmType ? UPDATE_COPY[confirmType] : UPDATE_COPY.servermon;
  const isUpdating = updating !== null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-lg bg-primary/10 p-2">
                <ServerCog className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base leading-tight">ServerMon Services</CardTitle>
                <CardDescription className="leading-relaxed">
                  Update this ServerMon app separately from a colocated Fleet agent.
                </CardDescription>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-full gap-2 rounded-lg px-3"
                onClick={onOpenHistory}
              >
                <History className="w-3.5 h-3.5" />
                History & Logs
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full gap-2 rounded-lg px-3"
                onClick={() => setConfirmType('servermon')}
                disabled={isUpdating}
              >
                <RefreshCcw
                  className={cn('w-3.5 h-3.5', updating === 'servermon' && 'animate-spin')}
                />
                Update ServerMon
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={agentStatus?.installed ? 'success' : 'outline'}
              className="text-[10px] uppercase font-bold tracking-wider"
            >
              {agentLoading
                ? 'Checking Agent'
                : agentStatus?.installed
                  ? 'Agent Installed'
                  : 'Agent Not Installed'}
            </Badge>
            {agentStatus?.installed && (
              <>
                <Badge
                  variant={agentStatus.active ? 'success' : 'warning'}
                  className="text-[10px] uppercase font-bold tracking-wider"
                >
                  {agentStatus.active ? 'Running' : 'Stopped'}
                </Badge>
                <Badge
                  variant={agentStatus.enabled ? 'success' : 'outline'}
                  className="text-[10px] uppercase font-bold tracking-wider"
                >
                  {agentStatus.enabled ? 'Auto-start On' : 'Auto-start Off'}
                </Badge>
              </>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="min-w-0">
              <span className="text-muted-foreground">Service: </span>
              <span className="font-mono break-all">
                {agentStatus?.serviceName ?? 'servermon-agent.service'}
              </span>
            </div>
            {agentStatus?.repoDir && (
              <div className="min-w-0">
                <span className="text-muted-foreground">Repo: </span>
                <span className="font-mono break-all">{agentStatus.repoDir}</span>
              </div>
            )}
            {agentStatus?.message && (
              <p className="text-xs text-muted-foreground">{agentStatus.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-full gap-2 rounded-lg px-3"
              onClick={loadAgentStatus}
              disabled={agentLoading || isUpdating}
            >
              <RefreshCcw className={cn('w-3.5 h-3.5', agentLoading && 'animate-spin')} />
              Refresh Agent
            </Button>
            <Button
              size="sm"
              className="h-9 w-full gap-2 rounded-lg px-3"
              onClick={() => setConfirmType('agent')}
              disabled={isUpdating || agentLoading || !agentStatus?.updateSupported}
            >
              <Download className={cn('w-3.5 h-3.5', updating === 'agent' && 'animate-pulse')} />
              Update Agent
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={confirmType !== null}
        onConfirm={handleConfirmUpdate}
        onCancel={() => setConfirmType(null)}
        title={copy.title}
        message={copy.message}
        confirmLabel={copy.title}
        cancelLabel="Cancel"
        variant="warning"
      />
    </>
  );
}
