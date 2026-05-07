'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  Download,
  History,
  RefreshCcw,
  Server,
  ServerCog,
  Settings2,
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
  LocalAutoUpdateTarget,
  ServermonAgentStatus,
} from '@/types/updates';
import { AutoUpdateScheduleModal } from './AutoUpdateScheduleModal';
import { formatNextRun, formatScheduleTime, getTimezoneLabel } from './AutoUpdateScheduleUtils';

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
  onOpenHistory: (type: LocalAutoUpdateTarget) => void;
}

interface AutoUpdateState {
  settings: LocalAutoUpdateSettings | null;
  schedule: LocalAutoUpdateScheduleState | null;
  loading: boolean;
}

export default function ServerMonServicesCard({ onOpenHistory }: ServerMonServicesCardProps) {
  const { toast } = useToast();
  const [agentStatus, setAgentStatus] = useState<ServermonAgentStatus | null>(null);
  const [autoUpdates, setAutoUpdates] = useState<Record<LocalAutoUpdateTarget, AutoUpdateState>>({
    servermon: { settings: null, schedule: null, loading: true },
    agent: { settings: null, schedule: null, loading: true },
  });
  const [agentLoading, setAgentLoading] = useState(true);
  const [updating, setUpdating] = useState<ServiceUpdateType | null>(null);
  const [confirmType, setConfirmType] = useState<ServiceUpdateType | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<LocalAutoUpdateTarget | null>(null);
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

  const loadAutoSettings = useCallback(async (target: LocalAutoUpdateTarget) => {
    setAutoUpdates((state) => ({
      ...state,
      [target]: { ...state[target], loading: true },
    }));
    try {
      const res = await fetch(`/api/system/update/auto?type=${target}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        settings?: LocalAutoUpdateSettings;
        schedule?: LocalAutoUpdateScheduleState;
      };
      setAutoUpdates((state) => ({
        ...state,
        [target]: {
          settings: data.settings ?? null,
          schedule: data.schedule ?? null,
          loading: false,
        },
      }));
    } catch {
      setAutoUpdates((state) => ({
        ...state,
        [target]: { settings: null, schedule: null, loading: false },
      }));
    } finally {
      setAutoUpdates((state) => ({
        ...state,
        [target]: { ...state[target], loading: false },
      }));
    }
  }, []);

  useEffect(() => {
    void loadAgentStatus();
    void loadAutoSettings('servermon');
    void loadAutoSettings('agent');
  }, [loadAgentStatus, loadAutoSettings]);

  const openSchedule = (target: LocalAutoUpdateTarget, enabled?: boolean) => {
    const current = autoUpdates[target].settings;
    setScheduleForm({
      enabled: enabled ?? current?.enabled ?? false,
      time: current?.time ?? '03:00',
      timezone: current?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    });
    setScheduleTarget(target);
  };

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
      if (!scheduleTarget) return;
      const res = await fetch(`/api/system/update/auto?type=${scheduleTarget}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save auto-update schedule');
      }
      setAutoUpdates((state) => ({
        ...state,
        [scheduleTarget]: {
          settings: data.settings ?? null,
          schedule: data.schedule ?? null,
          loading: false,
        },
      }));
      setScheduleTarget(null);
      toast({
        title: 'Auto-update schedule saved',
        description: scheduleForm.enabled
          ? `${getTargetName(scheduleTarget)} will check daily at ${scheduleForm.time} ${getTimezoneLabel(
              scheduleForm.timezone
            )}.`
          : `${getTargetName(scheduleTarget)} auto-update is disabled.`,
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
                <Server className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base leading-tight">ServerMon Updates</CardTitle>
                <CardDescription className="leading-relaxed">
                  Update the ServerMon app on its own schedule and keep its history separate.
                </CardDescription>
              </div>
            </div>
            <UpdateSchedulePanel
              title="ServerMon App"
              target="servermon"
              state={autoUpdates.servermon}
              onToggle={() =>
                openSchedule('servermon', !(autoUpdates.servermon.settings?.enabled ?? false))
              }
              onConfigure={() => openSchedule('servermon')}
            />
            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-full gap-2 rounded-lg px-3"
                onClick={() => onOpenHistory('servermon')}
              >
                <History className="w-3.5 h-3.5" />
                App History
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
      </Card>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-lg bg-primary/10 p-2">
                <ServerCog className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base leading-tight">Agent Updates</CardTitle>
                <CardDescription className="leading-relaxed">
                  Manage the colocated Fleet agent separately from the ServerMon app.
                </CardDescription>
              </div>
            </div>

            <UpdateSchedulePanel
              title="ServerMon Agent"
              target="agent"
              state={autoUpdates.agent}
              onToggle={() =>
                openSchedule('agent', !(autoUpdates.agent.settings?.enabled ?? false))
              }
              onConfigure={() => openSchedule('agent')}
            />
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
              onClick={() => onOpenHistory('agent')}
            >
              <History className="w-3.5 h-3.5" />
              Agent History
            </Button>
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
      {scheduleTarget && (
        <AutoUpdateScheduleModal
          scheduleForm={scheduleForm}
          setScheduleForm={setScheduleForm}
          autoSettingsTimezone={autoUpdates[scheduleTarget].settings?.timezone}
          title={`${getTargetName(scheduleTarget)} Auto-Update Schedule`}
          enableLabel={`Enable ${scheduleTarget === 'servermon' ? 'ServerMon app' : 'ServerMon agent'} auto-update`}
          onClose={() => setScheduleTarget(null)}
          onSave={saveSchedule}
          isSaving={scheduleSaving}
        />
      )}
    </>
  );
}

function UpdateSchedulePanel({
  title,
  target,
  state,
  onToggle,
  onConfigure,
}: {
  title: string;
  target: LocalAutoUpdateTarget;
  state: AutoUpdateState;
  onToggle: () => void;
  onConfigure: () => void;
}) {
  const settings = state.settings;
  const isEnabled = settings?.enabled ?? false;
  const toggleLabel =
    target === 'servermon'
      ? 'Toggle ServerMon app auto-update'
      : 'Toggle ServerMon agent auto-update';

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background/70">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-accent/20 px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {title}
            </p>
            <p className="text-sm font-bold text-foreground">
              {state.loading
                ? 'Loading schedule'
                : isEnabled
                  ? `Enabled at ${formatScheduleTime(settings?.time ?? '03:00')}`
                  : 'Disabled'}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label={toggleLabel}
          disabled={state.loading}
          onClick={onToggle}
          className={cn(
            'relative h-8 w-14 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            isEnabled
              ? 'border-primary/35 bg-primary shadow-sm shadow-primary/20'
              : 'border-border bg-muted/70'
          )}
        >
          <span
            className={cn(
              'absolute left-0 top-1 h-6 w-6 rounded-full bg-background shadow-sm ring-1 ring-border/50 transition-transform',
              isEnabled ? 'translate-x-7' : 'translate-x-1'
            )}
          />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        <ScheduleStat label="Time" value={formatScheduleTime(settings?.time ?? '03:00')} mono />
        <ScheduleStat label="Timezone" value={getTimezoneLabel(settings?.timezone ?? 'UTC')} />
        <ScheduleStat label="Next run" value={formatNextRun(state.schedule?.nextRunAt)} />
        <ScheduleStat label="Retry" value="2h, once" />
      </div>

      <div className="border-t border-border p-3">
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-full gap-2 rounded-lg px-3"
          onClick={onConfigure}
        >
          <Settings2 className="w-3.5 h-3.5" />
          {target === 'servermon' ? 'Configure App Schedule' : 'Configure Agent Schedule'}
        </Button>
      </div>
    </div>
  );
}

function getTargetName(target: LocalAutoUpdateTarget): string {
  return target === 'servermon' ? 'ServerMon App' : 'ServerMon Agent';
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
