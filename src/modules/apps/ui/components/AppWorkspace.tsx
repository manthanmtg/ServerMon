'use client';

import { useId, useState } from 'react';
import { ExternalLink, Eye, EyeOff, FileText, History, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/Drawer';
import type { AppsAutomationHealth, ManagedAppDTO } from '../../types';
import { formatAppBytes, getAppPublicUrl } from '../appPresentation';
import { AutoUpdateStatus } from './AutoUpdateStatus';

export type AppWorkspaceTab = 'overview' | 'deployments' | 'logs' | 'settings';

interface AppWorkspaceProps {
  app: ManagedAppDTO;
  initialTab: AppWorkspaceTab;
  snapshotUnavailable: boolean;
  automationHealth?: AppsAutomationHealth;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenRuntimeLogs: () => void;
  onOpenHistory: () => void;
  onOpenOperationLogs?: (operationId: string) => void;
}

const tabs: Array<{ id: AppWorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function formatUptime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function AppWorkspace({
  app,
  initialTab,
  snapshotUnavailable,
  automationHealth,
  onClose,
  onEdit,
  onDelete,
  onOpenRuntimeLogs,
  onOpenHistory,
  onOpenOperationLogs,
}: AppWorkspaceProps) {
  const [tab, setTab] = useState<AppWorkspaceTab>(initialTab);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const tabsId = useId();
  const activeOperation = [...app.operations]
    .reverse()
    .find((operation) => operation.status === 'running');

  return (
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={app.name}
      description={
        <span className="flex items-center gap-2">
          <a
            href={getAppPublicUrl(app)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {app.domain}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {snapshotUnavailable && <Badge variant="warning">Last known snapshot</Badge>}
        </span>
      }
      className="[&]:w-screen md:[&]:w-[min(92vw,64rem)]"
    >
      <div className="space-y-5">
        <div
          role="tablist"
          aria-label={`${app.name} workspace`}
          className="flex overflow-x-auto rounded-xl border border-border bg-muted/20 p-1"
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const currentIndex = tabs.findIndex((entry) => entry.id === tab);
            const nextIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
                    tabs.length;
            const nextTab = tabs[nextIndex];
            setTab(nextTab.id);
            if (nextTab.id !== 'settings') setRevealed(new Set());
            document.getElementById(`${tabsId}-${nextTab.id}-tab`)?.focus();
          }}
        >
          {tabs.map((entry) => (
            <button
              key={entry.id}
              id={`${tabsId}-${entry.id}-tab`}
              role="tab"
              type="button"
              aria-selected={tab === entry.id}
              aria-controls={`${tabsId}-${entry.id}-panel`}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors ${tab === entry.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => {
                setTab(entry.id);
                if (entry.id !== 'settings') setRevealed(new Set());
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div
            id={`${tabsId}-overview-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-overview-tab`}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Section title="Current release">
                <p className="font-mono text-sm">{app.currentReleaseId ?? 'Not deployed'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {app.git?.deployedSha?.slice(0, 7) ?? 'Deployed commit unavailable'}
                </p>
              </Section>
              <Section title="Runtime">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {app.runtime?.available ? app.runtime.serviceName : 'Runtime unavailable'}
                  </span>
                  <Badge variant={app.runtime?.available ? 'success' : 'warning'}>
                    {app.runtime?.available ? (app.runtime.activeState ?? 'active') : 'Unavailable'}
                  </Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">CPU</dt>
                    <dd className="mt-1 tabular-nums">
                      {app.runtime?.cpuPercent === undefined
                        ? '—'
                        : `${app.runtime.cpuPercent.toFixed(1)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Memory</dt>
                    <dd className="mt-1 tabular-nums">
                      {formatAppBytes(app.runtime?.memoryBytes)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Uptime</dt>
                    <dd className="mt-1">{formatUptime(app.runtime?.uptimeSeconds)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Restarts</dt>
                    <dd className="mt-1 tabular-nums">{app.runtime?.restartCount ?? '—'}</dd>
                  </div>
                </dl>
              </Section>
            </div>
            {activeOperation && (
              <Section title="Current operation">
                <button
                  type="button"
                  className="text-left text-sm font-medium text-primary hover:underline"
                  onClick={() => setTab('deployments')}
                >
                  {snapshotUnavailable
                    ? `Last observed: ${activeOperation.step}`
                    : activeOperation.step}
                </button>
              </Section>
            )}
            {app.git && (
              <AutoUpdateStatus
                git={app.git}
                health={automationHealth}
                snapshotUnavailable={snapshotUnavailable}
                onOpenLogs={onOpenOperationLogs}
                now={automationHealth ? new Date(automationHealth.serverTime) : undefined}
              />
            )}
          </div>
        )}

        {tab === 'deployments' && (
          <div
            id={`${tabsId}-deployments-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-deployments-tab`}
            className="space-y-4"
          >
            <Section title="Deployments">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Review releases, rollbacks, and deployment output.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={onOpenHistory}>
                  <History className="h-3.5 w-3.5" />
                  Open deployment history
                </Button>
              </div>
              {activeOperation && (
                <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <div className="text-sm font-medium">{activeOperation.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {snapshotUnavailable
                      ? `Last observed: ${activeOperation.step}`
                      : activeOperation.step}
                  </p>
                  {onOpenOperationLogs && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-2"
                      onClick={() => onOpenOperationLogs(activeOperation.id)}
                    >
                      Open live logs
                    </Button>
                  )}
                </div>
              )}
              {app.releases.length === 0 && (
                <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  No deployment history yet.
                </p>
              )}
            </Section>
          </div>
        )}

        {tab === 'logs' && (
          <div id={`${tabsId}-logs-panel`} role="tabpanel" aria-labelledby={`${tabsId}-logs-tab`}>
            <Section title="Runtime logs">
              <p className="text-sm text-muted-foreground">
                Open the latest journal entries for this app&apos;s service.
              </p>
              <Button type="button" size="sm" className="mt-4" onClick={onOpenRuntimeLogs}>
                <FileText className="h-3.5 w-3.5" />
                View runtime logs
              </Button>
            </Section>
          </div>
        )}

        {tab === 'settings' && (
          <div
            id={`${tabsId}-settings-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-settings-tab`}
            className="space-y-4"
          >
            <Section title="Runtime settings">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="mt-1 break-all">
                    {app.sourceType === 'git' ? app.git?.url : app.sourcePath}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Port</dt>
                  <dd className="mt-1 font-mono">127.0.0.1:{app.port}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Health check</dt>
                  <dd className="mt-1 font-mono">{app.healthCheckPath}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">TLS</dt>
                  <dd className="mt-1">{app.tlsEnabled ? 'HTTPS requested' : 'HTTP only'}</dd>
                </div>
              </dl>
              <Button type="button" size="sm" variant="outline" className="mt-4" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
                Edit configuration
              </Button>
            </Section>
            <Section title="Environment variables">
              {Object.entries(app.envVars).length ? (
                <div className="space-y-2">
                  {Object.entries(app.envVars).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3"
                    >
                      <code className="min-w-0 truncate text-xs">{key}</code>
                      <div className="flex min-w-0 items-center gap-2">
                        <code className="truncate text-xs text-muted-foreground">
                          {revealed.has(key) ? value || '(empty)' : '••••••••••••'}
                        </code>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`${revealed.has(key) ? 'Hide' : 'Show'} ${key}`}
                          onClick={() =>
                            setRevealed((current) => {
                              const next = new Set(current);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        >
                          {revealed.has(key) ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No environment variables configured.
                </p>
              )}
            </Section>
            <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Permanently remove this app, its service, releases, and managed configuration.
              </p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="mt-4"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete app
              </Button>
            </section>
          </div>
        )}
      </div>
    </Drawer>
  );
}
