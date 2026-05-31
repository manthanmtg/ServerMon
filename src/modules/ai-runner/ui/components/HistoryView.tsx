'use client';

import { memo, type MutableRefObject } from 'react';
import { ListFilter, RefreshCcw, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AIRunnerProfileDTO, AIRunnerRunDTO, AIRunnerScheduleDTO } from '../types';
import {
  formatDateTime,
  formatDuration,
  formatMemory,
  formatRelative,
  getRunStatusVariant,
} from '../utils';

interface HistoryViewProps {
  runSearch: string;
  setRunSearch: (search: string) => void;
  historyStatusFilter: 'all' | AIRunnerRunDTO['status'];
  setHistoryStatusFilter: (status: 'all' | AIRunnerRunDTO['status']) => void;
  historyTriggerFilter: 'all' | AIRunnerRunDTO['triggeredBy'];
  setHistoryTriggerFilter: (trigger: 'all' | AIRunnerRunDTO['triggeredBy']) => void;
  historyProfileFilter: string;
  setHistoryProfileFilter: (profileId: string) => void;
  historyScheduleFilter: string;
  setHistoryScheduleFilter: (scheduleId: string) => void;
  profiles: AIRunnerProfileDTO[];
  profileMap: Record<string, AIRunnerProfileDTO>;
  schedules: AIRunnerScheduleDTO[];
  filteredHistoryRuns: AIRunnerRunDTO[];
  historyRowRefs: React.MutableRefObject<Record<string, HTMLTableRowElement | null>>;
  openRunDetail: (run: AIRunnerRunDTO) => void;
  selectedRun: AIRunnerRunDTO | null;
  focusedHistoryRunId: string | null;
  loadAll: (search?: string) => Promise<void>;
  isActionPending: (key: string) => boolean;
  runExclusiveAction: (key: string, action: () => Promise<void>) => Promise<void>;
  getRunDisplayName: (run: AIRunnerRunDTO) => string;
  getRunContextLabel: (run: AIRunnerRunDTO) => string;
  promptMap: Record<string, { name: string }>;
}

type HistoryRunRowProps = {
  run: AIRunnerRunDTO;
  isSelected: boolean;
  isFocused: boolean;
  profileMap: Record<string, AIRunnerProfileDTO>;
  historyRowRefs: MutableRefObject<Record<string, HTMLTableRowElement | null>>;
  onOpenRun: (run: AIRunnerRunDTO) => void;
  getRunDisplayName: (run: AIRunnerRunDTO) => string;
  getRunContextLabel: (run: AIRunnerRunDTO) => string;
  getRunStatusVariant: (
    status: AIRunnerRunDTO['status']
  ) => 'success' | 'warning' | 'destructive' | 'default' | 'outline';
  promptMap: Record<string, { name: string }>;
};

const HistoryRunRow = memo(function HistoryRunRow({
  run,
  isSelected,
  isFocused,
  profileMap,
  historyRowRefs,
  onOpenRun,
  getRunDisplayName,
  getRunContextLabel,
  getRunStatusVariant,
  promptMap,
}: HistoryRunRowProps) {
  return (
    <tr
      key={run._id}
      ref={(node) => {
        historyRowRefs.current[run._id] = node;
      }}
      tabIndex={-1}
      onClick={() => onOpenRun(run)}
      className={cn(
        'cursor-pointer border-b border-border/40 transition-colors hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-ring/40',
        isSelected && 'bg-primary/5',
        isFocused && 'bg-primary/10'
      )}
    >
      <td className="px-4 py-3 align-top">
        <Badge variant={getRunStatusVariant(run.status)}>{run.status}</Badge>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="max-w-[220px]">
          <p className="truncate font-medium">{getRunDisplayName(run)}</p>
          <p className="truncate text-xs text-muted-foreground">{getRunContextLabel(run)}</p>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="max-w-[280px]">
          <p className="truncate">{run.promptContent.slice(0, 80)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {run.promptId ? promptMap[run.promptId]?.name || 'Saved prompt' : 'Inline prompt'}
          </p>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        {profileMap[run.agentProfileId]?.name || 'Unknown profile'}
      </td>
      <td className="px-4 py-3 align-top">
        <Badge variant="outline">{run.triggeredBy}</Badge>
      </td>
      <td className="px-4 py-3 align-top">
        <span className="block max-w-[220px] truncate text-xs text-muted-foreground">
          {run.workingDirectory}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <div>
          <p>{formatDateTime(run.startedAt ?? run.queuedAt)}</p>
          <p className="text-xs text-muted-foreground">{formatRelative(run.startedAt ?? run.queuedAt)}</p>
        </div>
      </td>
      <td className="px-4 py-3 align-top">{formatDuration(run.durationSeconds)}</td>
      <td className="px-4 py-3 align-top">{run.exitCode === undefined ? '—' : run.exitCode}</td>
      <td className="px-4 py-3 align-top">
        <div className="text-xs text-muted-foreground">
          <p>CPU {run.resourceUsage?.peakCpuPercent?.toFixed(1) ?? '—'}%</p>
          <p>Mem {formatMemory(run.resourceUsage?.peakMemoryBytes)}</p>
        </div>
      </td>
    </tr>
  );
});

export function HistoryView({
  runSearch,
  setRunSearch,
  historyStatusFilter,
  setHistoryStatusFilter,
  historyTriggerFilter,
  setHistoryTriggerFilter,
  historyProfileFilter,
  setHistoryProfileFilter,
  historyScheduleFilter,
  setHistoryScheduleFilter,
  profiles,
  profileMap,
  schedules,
  filteredHistoryRuns,
  historyRowRefs,
  openRunDetail,
  selectedRun,
  focusedHistoryRunId,
  loadAll,
  isActionPending,
  runExclusiveAction,
  getRunDisplayName,
  getRunContextLabel,
  promptMap,
}: HistoryViewProps) {
  return (
    <div
      id="runner-tab-history"
      role="tabpanel"
      aria-labelledby="tab-history"
      className="space-y-5"
    >
      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="border-b border-border/60 px-5 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(260px,1.4fr)_repeat(4,minmax(0,1fr))]">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Search</span>
                  <Input
                    value={runSearch}
                    onChange={(event) => setRunSearch(event.target.value)}
                    placeholder="Prompt, command, profile, workspace"
                    icon={<Search className="w-4 h-4" />}
                  />
                </label>

                <label className="space-y-1">
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <ListFilter className="w-3.5 h-3.5" />
                    Status
                  </span>
                  <select
                    value={historyStatusFilter}
                    onChange={(event) =>
                      setHistoryStatusFilter(event.target.value as typeof historyStatusFilter)
                    }
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="all">All statuses</option>
                    <option value="queued">Queued</option>
                    <option value="running">Running</option>
                    <option value="retrying">Retrying</option>
                    <option value="skipped">Skipped</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="timeout">Timed out</option>
                    <option value="killed">Killed</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Trigger</span>
                  <select
                    value={historyTriggerFilter}
                    onChange={(event) =>
                      setHistoryTriggerFilter(event.target.value as typeof historyTriggerFilter)
                    }
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="all">All triggers</option>
                    <option value="manual">Manual</option>
                    <option value="schedule">Schedule</option>
                    <option value="autoflow">AutoFlow</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Profile</span>
                  <select
                    value={historyProfileFilter}
                    onChange={(event) => setHistoryProfileFilter(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="all">All profiles</option>
                    {profiles.map((profile) => (
                      <option key={profile._id} value={profile._id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Schedule</span>
                  <select
                    value={historyScheduleFilter}
                    onChange={(event) => setHistoryScheduleFilter(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    <option value="all">All schedules</option>
                    <option value="none">No schedule</option>
                    {schedules.map((schedule) => (
                      <option key={schedule._id} value={schedule._id}>
                        {schedule.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <Button
                variant="outline"
                onClick={() => void runExclusiveAction('history:refresh', () => loadAll(runSearch))}
                loading={isActionPending('history:refresh')}
                className="h-10 shrink-0 self-end"
              >
                <RefreshCcw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border/60 bg-secondary/20 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Run</th>
                  <th className="px-4 py-3 text-left font-medium">Prompt</th>
                  <th className="px-4 py-3 text-left font-medium">Profile</th>
                  <th className="px-4 py-3 text-left font-medium">Trigger</th>
                  <th className="px-4 py-3 text-left font-medium">Workspace</th>
                  <th className="px-4 py-3 text-left font-medium">Started</th>
                  <th className="px-4 py-3 text-left font-medium">Duration</th>
                  <th className="px-4 py-3 text-left font-medium">Exit</th>
                  <th className="px-4 py-3 text-left font-medium">Resources</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistoryRuns.map((run) => (
                  <HistoryRunRow
                    key={run._id}
                    run={run}
                    isSelected={selectedRun?._id === run._id}
                    isFocused={focusedHistoryRunId === run._id}
                    profileMap={profileMap}
                    historyRowRefs={historyRowRefs}
                    onOpenRun={openRunDetail}
                    getRunDisplayName={getRunDisplayName}
                    getRunContextLabel={getRunContextLabel}
                    getRunStatusVariant={getRunStatusVariant}
                    promptMap={promptMap}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {filteredHistoryRuns.length === 0 && (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              No runs match the current history filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
