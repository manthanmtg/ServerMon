'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Download,
  History,
  RefreshCcw,
  ServerCog,
  Settings2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type {
  LocalAutoUpdateScheduleState,
  LocalAutoUpdateSettings,
  ServermonAgentStatus,
} from '@/types/updates';

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
  const [autoSettings, setAutoSettings] = useState<LocalAutoUpdateSettings | null>(null);
  const [autoSchedule, setAutoSchedule] = useState<LocalAutoUpdateScheduleState | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [autoLoading, setAutoLoading] = useState(true);
  const [updating, setUpdating] = useState<ServiceUpdateType | null>(null);
  const [confirmType, setConfirmType] = useState<ServiceUpdateType | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    enabled: false,
    time: '03:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });

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

  const loadAutoSettings = useCallback(async () => {
    setAutoLoading(true);
    try {
      const res = await fetch('/api/system/update/auto');
      if (!res.ok) return;
      const data = (await res.json()) as {
        settings?: LocalAutoUpdateSettings;
        schedule?: LocalAutoUpdateScheduleState;
      };
      if (data.settings) {
        setAutoSettings(data.settings);
        setScheduleForm({
          enabled: data.settings.enabled,
          time: data.settings.time,
          timezone: data.settings.timezone,
        });
      }
      setAutoSchedule(data.schedule ?? null);
    } catch {
      setAutoSettings(null);
      setAutoSchedule(null);
    } finally {
      setAutoLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgentStatus();
    void loadAutoSettings();
  }, [loadAgentStatus, loadAutoSettings]);

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

  const saveSchedule = async () => {
    setScheduleSaving(true);
    try {
      const res = await fetch('/api/system/update/auto', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save auto-update schedule');
      }
      setAutoSettings(data.settings ?? null);
      setAutoSchedule(data.schedule ?? null);
      setScheduleOpen(false);
      toast({
        title: 'Auto-update schedule saved',
        description: scheduleForm.enabled
          ? `ServerMon will check daily at ${scheduleForm.time} ${scheduleForm.timezone}.`
          : 'Local auto-update is disabled.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Schedule save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setScheduleSaving(false);
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
                  Update this ServerMon app and its colocated Fleet agent from one local maintenance
                  flow.
                </CardDescription>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-background/70">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-accent/20 px-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CalendarClock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Scheduled updater
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {autoLoading
                        ? 'Loading schedule'
                        : autoSettings?.enabled
                          ? `Enabled at ${autoSettings.time}`
                          : 'Disabled'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Toggle local auto-update"
                  onClick={() => {
                    const next = !(autoSettings?.enabled ?? false);
                    setScheduleForm((form) => ({ ...form, enabled: next }));
                    setAutoSettings((settings) =>
                      settings ? { ...settings, enabled: next } : settings
                    );
                    setScheduleOpen(true);
                  }}
                  className={cn(
                    'relative h-8 w-14 shrink-0 rounded-full border transition-colors',
                    autoSettings?.enabled
                      ? 'border-primary/30 bg-primary'
                      : 'border-border bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 h-6 w-6 rounded-full bg-background shadow-sm transition-transform',
                      autoSettings?.enabled ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 p-3">
                <ScheduleStat label="Time" value={autoSettings?.time ?? '03:00'} mono />
                <ScheduleStat label="Timezone" value={autoSettings?.timezone ?? 'UTC'} />
                <ScheduleStat label="Next run" value={formatNextRun(autoSchedule?.nextRunAt)} />
                <ScheduleStat label="Retry" value="2h, once" />
              </div>

              <div className="mx-3 mb-3 rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Checks upstream changes first. Clean repos are recorded as skipped with no restart.
              </div>

              <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                {['Check app', 'Update app', 'Check agent', 'Update agent'].map((step, index) => (
                  <div
                    key={step}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                      {index + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full gap-2 rounded-lg px-3"
                  onClick={() => setScheduleOpen(true)}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Configure Schedule
                </Button>
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
      {scheduleOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setScheduleOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-auto-update-title"
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-6">
              <div>
                <h3 id="local-auto-update-title" className="text-lg font-bold text-foreground">
                  Local Auto-Update Schedule
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  ServerMon owns the schedule; update work runs detached through systemd.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close schedule modal"
                onClick={() => setScheduleOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 text-sm font-semibold text-foreground">
                <span>Enable local auto-update</span>
                <input
                  aria-label="Enable local auto-update"
                  type="checkbox"
                  checked={scheduleForm.enabled}
                  onChange={(event) =>
                    setScheduleForm((form) => ({ ...form, enabled: event.target.checked }))
                  }
                  className="h-5 w-5 accent-primary"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Daily time
                </span>
                <input
                  aria-label="Daily time"
                  type="time"
                  value={scheduleForm.time}
                  onChange={(event) =>
                    setScheduleForm((form) => ({ ...form, time: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Timezone
                </span>
                <input
                  aria-label="Timezone"
                  type="text"
                  value={scheduleForm.timezone}
                  onChange={(event) =>
                    setScheduleForm((form) => ({ ...form, timezone: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                {[
                  'Check before updating',
                  'Include running local agent',
                  'Stop agent update if app fails',
                  'Missed run retry: 2 hours, 1 retry',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-border bg-muted/20 p-6 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                className="h-11 rounded-xl"
                onClick={() => setScheduleOpen(false)}
                disabled={scheduleSaving}
              >
                Cancel
              </Button>
              <Button className="h-11 rounded-xl" loading={scheduleSaving} onClick={saveSchedule}>
                Save Schedule
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ScheduleStat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 truncate text-xs font-bold text-foreground', mono && 'font-mono')}>
        {value}
      </p>
    </div>
  );
}

function formatNextRun(value?: string | null): string {
  if (!value) return 'Paused';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
