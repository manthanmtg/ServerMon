'use client';

import { CheckCircle2, CircleAlert, Ellipsis, ExternalLink, Play, RefreshCw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AppsAutomationHealth, ManagedAppDTO } from '../../types';
import {
  formatAppBytes,
  formatAppRelativeTime,
  getAppMonogram,
  getAppPublicUrl,
} from '../appPresentation';
import type { AppsCollectionView } from './AppsCollectionToolbar';

export interface AppCardProps {
  app: ManagedAppDTO;
  view: AppsCollectionView;
  snapshotUnavailable: boolean;
  automationHealth?: AppsAutomationHealth;
  busy: boolean;
  deploying: boolean;
  updating: boolean;
  now: Date;
  onOpenWorkspace: (tab?: 'overview' | 'deployments' | 'logs' | 'settings') => void;
  onDeploy: () => void;
  onUpdate: () => void;
}

function appStatus(app: ManagedAppDTO, snapshotUnavailable: boolean) {
  if (snapshotUnavailable)
    return { label: `Last known: ${app.status}`, variant: 'warning' as const };
  if (app.status === 'running') return { label: 'Running', variant: 'success' as const };
  if (app.status === 'failed') return { label: 'Failed', variant: 'destructive' as const };
  if (app.status === 'deploying') return { label: 'Deploying', variant: 'warning' as const };
  return { label: app.status, variant: 'secondary' as const };
}

function automationLabel(
  app: ManagedAppDTO,
  health: AppsAutomationHealth | undefined,
  stale: boolean
) {
  if (!app.git) return 'Local source · Manual deployments';
  if (stale) return 'Updates: status unavailable';
  const state = app.git.autoUpdate;
  if (!state.enabled)
    return state.pauseReason === 'rollback' ? 'Updates paused after rollback' : 'Updates disabled';
  if (health?.worker.status && health.worker.status !== 'healthy')
    return 'Updates blocked: worker unavailable';
  if (state.blockReason === 'worker_unavailable' || state.blockReason === 'scheduler_stale')
    return 'Updates blocked';
  if (state.operationStatus === 'queued') return 'Auto-update queued';
  if (state.operationStatus === 'running') return 'Auto-update in progress';
  if (state.lastStatus === 'failed') return 'Latest auto-update failed';
  if (state.lastCheckCompletedAt)
    return `Auto-update · checked ${formatAppRelativeTime(state.lastCheckCompletedAt, new Date(), 'recently')}`;
  return `Auto-update · every ${state.intervalMinutes} min`;
}

export function AppCard({
  app,
  view,
  snapshotUnavailable,
  automationHealth,
  busy,
  deploying,
  updating,
  now,
  onOpenWorkspace,
  onDeploy,
  onUpdate,
}: AppCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);
  const status = appStatus(app, snapshotUnavailable);
  const activeOperation = app.operations.find((operation) => operation.status === 'running');
  const deployedAt = app.lastDeployedAt ?? app.releases.at(-1)?.activatedAt;

  useEffect(() => {
    if (!actionsOpen) return;
    const close = (event: MouseEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [actionsOpen]);

  return (
    <Card
      className={
        view === 'list'
          ? 'transition-colors hover:border-primary/40'
          : 'transition-all hover:border-primary/40 hover:shadow-md'
      }
    >
      <CardContent
        className={
          view === 'list'
            ? 'grid gap-4 p-5 lg:grid-cols-[minmax(16rem,1.3fr)_minmax(12rem,1fr)_minmax(14rem,1fr)_auto] lg:items-center'
            : 'space-y-4 p-5'
        }
      >
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary"
              aria-hidden="true"
            >
              {getAppMonogram(app)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 truncate text-base font-semibold">
                  <button
                    type="button"
                    className="truncate text-left text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open ${app.name} workspace`}
                    onClick={() => onOpenWorkspace()}
                  >
                    {app.name}
                  </button>
                </h3>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <a
                href={getAppPublicUrl(app)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-sm text-primary hover:underline"
              >
                <span className="truncate">{app.domain}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        <div className="min-w-0 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {app.sourceType === 'git'
              ? `Git · ${app.git?.branch ?? 'Unknown branch'}`
              : 'Local source'}
          </div>
          <div className="mt-2 font-mono text-xs text-foreground">
            {app.git?.deployedSha?.slice(0, 7) ?? app.currentReleaseId ?? 'Not deployed'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Deployed {formatAppRelativeTime(deployedAt, now, 'not yet')}
          </div>
        </div>

        <div className="min-w-0 text-sm">
          <button
            type="button"
            className="max-w-full text-left text-xs leading-5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenWorkspace('overview')}
          >
            {automationLabel(app, automationHealth, snapshotUnavailable)}
          </button>
          {app.runtime?.available && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
              <span>
                CPU{' '}
                {app.runtime.cpuPercent === undefined || !Number.isFinite(app.runtime.cpuPercent)
                  ? '—'
                  : `${app.runtime.cpuPercent.toFixed(1)}%`}
              </span>
              <span>{formatAppBytes(app.runtime.memoryBytes)}</span>
            </div>
          )}
          {(activeOperation || busy) && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-warning hover:underline"
              onClick={() => onOpenWorkspace('deployments')}
            >
              <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {activeOperation
                ? snapshotUnavailable
                  ? `Last observed: ${activeOperation.step}`
                  : activeOperation.step
                : 'Operation queued'}
            </button>
          )}
        </div>

        <div className="relative flex flex-wrap items-center gap-2" ref={actionsRef}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.open(getAppPublicUrl(app), '_blank', 'noopener,noreferrer')}
          >
            Open app
          </Button>
          <Button type="button" size="sm" loading={deploying} disabled={busy} onClick={onDeploy}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {deploying ? 'Deploying…' : 'Deploy'}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Actions for ${app.name}`}
            aria-expanded={actionsOpen}
            aria-controls={actionsId}
            onClick={() => setActionsOpen((open) => !open)}
          >
            <Ellipsis className="h-4 w-4" />
          </Button>
          {actionsOpen && (
            <div
              id={actionsId}
              className="absolute right-0 top-full z-20 mt-2 grid min-w-48 gap-1 rounded-xl border border-border bg-popover p-2 shadow-xl"
            >
              {app.sourceType === 'git' && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="justify-start"
                  disabled={busy}
                  loading={updating}
                  onClick={() => {
                    setActionsOpen(false);
                    onUpdate();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Check & deploy
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setActionsOpen(false);
                  onOpenWorkspace('deployments');
                }}
              >
                Deployment history
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setActionsOpen(false);
                  onOpenWorkspace('logs');
                }}
              >
                Runtime logs
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setActionsOpen(false);
                  onOpenWorkspace('settings');
                }}
              >
                Settings
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
