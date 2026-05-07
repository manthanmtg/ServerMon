import {
  Copy,
  Globe2,
  HardDrive,
  Lock,
  LoaderCircle,
  Logs,
  Play,
  Power,
  RefreshCw,
  ShieldAlert,
  Square,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ManagedDatabaseDTO } from '../types';

export type DatabaseAction = 'start' | 'stop' | 'restart';

interface DatabaseDeploymentCardProps {
  database: ManagedDatabaseDTO;
  isWorking: boolean;
  copiedConnectionId: string | null;
  operationLogs: string[];
  onDeploy: (database: ManagedDatabaseDTO) => void;
  onAction: (database: ManagedDatabaseDTO, nextAction: DatabaseAction) => void;
  onCopyConnection: (value: string, databaseId?: string) => void;
}

function StatusBadge({ status }: { status: ManagedDatabaseDTO['status'] }) {
  const variants: Record<ManagedDatabaseDTO['status'], BadgeVariant> = {
    draft: 'secondary',
    deploying: 'warning',
    running: 'success',
    stopped: 'outline',
    failed: 'destructive',
    unknown: 'secondary',
  };

  return <Badge variant={variants[status]}>{status}</Badge>;
}

export function DatabaseDeploymentCard({
  database,
  isWorking,
  copiedConnectionId,
  operationLogs,
  onDeploy,
  onAction,
  onCopyConnection,
}: DatabaseDeploymentCardProps) {
  const activityLines = [...(database.logs ?? []), ...operationLogs];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{database.name}</CardTitle>
              <StatusBadge status={database.status} />
              <Badge variant="outline">{database.image}</Badge>
              <Badge variant={database.publicRoute ? 'warning' : 'secondary'}>
                {database.publicRoute ? (
                  <Globe2 className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                {database.publicRoute ? 'Public' : 'Local only'}
              </Badge>
            </div>
            <CardDescription className="mt-2">
              {database.bindAddress}:{database.port} to container {database.internalPort}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDeploy(database)}
              loading={isWorking}
              aria-label={`Deploy ${database.name}`}
            >
              <Play className="h-4 w-4" />
              Deploy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction(database, 'restart')}
              disabled={database.status === 'draft'}
            >
              <RefreshCw className="h-4 w-4" />
              Restart
            </Button>
            {database.status === 'running' ? (
              <Button variant="outline" size="sm" onClick={() => onAction(database, 'stop')}>
                <Square className="h-4 w-4" />
                Stop
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAction(database, 'start')}
                disabled={database.status === 'draft'}
              >
                <Power className="h-4 w-4" />
                Start
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              Data path
            </div>
            <code className="break-all text-xs text-foreground">{database.dataPath}</code>
          </div>
          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Copy className="h-3.5 w-3.5" />
                Connection string
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Copy connection string for ${database.name}`}
                onClick={() => onCopyConnection(database.connection.maskedUri, database.id)}
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedConnectionId === database.id ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <code className="break-all text-xs text-foreground">
              {database.connection.maskedUri}
            </code>
          </div>
        </div>
        <div className="space-y-2 rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            Security notes
          </div>
          <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground">
            {database.securityNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2 rounded-lg border border-border bg-background p-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Logs className="h-3.5 w-3.5" />
              Activity
            </div>
            {isWorking && (
              <Badge variant="warning">
                <LoaderCircle className="h-3 w-3 animate-spin" />
                Deploying
              </Badge>
            )}
          </div>
          <div
            aria-label={`${database.name} activity log`}
            className="max-h-40 overflow-auto rounded-md bg-muted/25 p-3 font-mono text-[11px] leading-5 text-muted-foreground"
          >
            {activityLines.length > 0 ? (
              activityLines
                .slice(-16)
                .map((line, index) => <div key={`${line}-${index}`}>{line}</div>)
            ) : (
              <div>No deployment activity yet.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
