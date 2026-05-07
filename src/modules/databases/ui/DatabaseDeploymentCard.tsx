import {
  ChevronDown,
  ChevronUp,
  Copy,
  Globe2,
  HardDrive,
  Lock,
  LoaderCircle,
  Logs,
  Play,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Square,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ManagedDatabaseDTO } from '../types';

export type DatabaseAction = 'start' | 'stop' | 'restart';

const smallButtonLinkClassName =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-transparent px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

interface DatabaseDeploymentCardProps {
  database: ManagedDatabaseDTO;
  isWorking: boolean;
  isExpanded: boolean;
  copiedConnectionId: string | null;
  operationLogs: string[];
  onDeploy: (database: ManagedDatabaseDTO) => void;
  onAction: (database: ManagedDatabaseDTO, nextAction: DatabaseAction) => void;
  onCopyConnection: (value: string, databaseId?: string) => void;
  onToggleExpanded: (databaseId: string) => void;
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

function formatDateTime(value: string | undefined): string {
  if (!value) return 'Not used yet';
  return new Date(value).toLocaleString();
}

export function DatabaseDeploymentCard({
  database,
  isWorking,
  isExpanded,
  copiedConnectionId,
  operationLogs,
  onDeploy,
  onAction,
  onCopyConnection,
  onToggleExpanded,
}: DatabaseDeploymentCardProps) {
  const activityLines = [...(database.logs ?? []), ...operationLogs];
  const latestActivity = activityLines.at(-1) ?? 'No deployment activity yet.';
  const explorerIdleTimeoutMinutes = database.explorer?.idleTimeoutMinutes ?? 30;

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
              <a
                className={smallButtonLinkClassName}
                href={`/databases/explore/${database.id}`}
                aria-label={`Explore ${database.name}`}
              >
                <Search className="h-4 w-4" />
                Explore
              </a>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <Search className="h-4 w-4" />
                Explore
              </Button>
            )}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${database.name}`}
              onClick={() => onToggleExpanded(database.id)}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {isExpanded ? 'Less' : 'More'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Listen address</div>
            <div className="mt-1 truncate font-medium">
              {database.bindAddress}:{database.port}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Container {database.internalPort}
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              Data path
            </div>
            <code className="mt-1 block truncate text-xs text-foreground">{database.dataPath}</code>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Copy className="h-3.5 w-3.5" />
                  Connection
                </div>
                <code className="mt-1 block truncate text-xs text-foreground">
                  {database.connection.maskedUri}
                </code>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={`Copy connection string for ${database.name}`}
                onClick={() => onCopyConnection(database.connection.maskedUri, database.id)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            {copiedConnectionId === database.id && (
              <div className="mt-1 text-xs font-medium text-success">Copied</div>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/25 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <HardDrive className="h-3.5 w-3.5" />
                  Full data path
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
                    aria-label={`Copy full connection string for ${database.name}`}
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
              <div className="rounded-lg border border-border bg-muted/25 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Logs className="h-3.5 w-3.5" />
                  Latest activity
                </div>
                <code className="break-all text-xs text-foreground">{latestActivity}</code>
              </div>
              <div className="rounded-lg border border-border bg-muted/25 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Power className="h-3.5 w-3.5" />
                  Explorer auto-stop
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>
                    Stops after {explorerIdleTimeoutMinutes} minutes without explorer activity.
                  </div>
                  <div>Last used {formatDateTime(database.explorer?.lastAccessedAt)}</div>
                  {database.explorer?.status === 'running' && database.explorer.idleExpiresAt && (
                    <div>Stops at {formatDateTime(database.explorer?.idleExpiresAt)}</div>
                  )}
                </div>
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
