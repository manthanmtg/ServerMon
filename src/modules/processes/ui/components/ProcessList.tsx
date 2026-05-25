import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProcessListEmptyState, ProcessListFooter } from './ProcessListChrome';
import { ProcessCard, ProcessRow } from './ProcessListRows';
import type { ProcessInfo, ProcessSortField } from '../types';

interface SortHeaderProps {
  field: ProcessSortField;
  children: React.ReactNode;
  className?: string;
  currentSort: ProcessSortField;
  onSort: (field: ProcessSortField) => void;
}

const SortHeader = React.memo(
  ({ field, children, className, currentSort, onSort }: SortHeaderProps) => (
    <th
      className={cn('px-3 py-2.5 text-xs font-medium text-muted-foreground', className)}
      aria-sort={currentSort === field ? 'descending' : 'none'}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
        onClick={() => onSort(field)}
        aria-label={`Sort by ${String(children)}`}
      >
        {children}
        {currentSort === field && <ArrowUpDown className="w-3 h-3 text-primary" />}
      </button>
    </th>
  )
);

SortHeader.displayName = 'SortHeader';

interface ProcessListProps {
  processes: ProcessInfo[];
  sortField: ProcessSortField;
  expandedPid: number | null;
  killingPid: number | null;
  onToggleSort: (field: ProcessSortField) => void;
  onToggleExpanded: (pid: number) => void;
  onKillProcess: (pid: number, signal: string) => void;
}

interface ProcessListMobileViewProps {
  processes: ProcessInfo[];
  expandedPid: number | null;
  killingPid: number | null;
  onToggleExpanded: (pid: number) => void;
  onKillProcess: (pid: number, signal: string) => void;
}

const ProcessListMobileView = React.memo(function ProcessListMobileView({
  processes,
  expandedPid,
  killingPid,
  onToggleExpanded,
  onKillProcess,
}: ProcessListMobileViewProps) {
  return (
    <div className="sm:hidden divide-y divide-border" role="list" aria-label="Processes">
      {processes.map((process) => (
        <ProcessCard
          key={process.pid}
          process={process}
          isExpanded={expandedPid === process.pid}
          isKilling={killingPid === process.pid}
          onToggleExpand={onToggleExpanded}
          onKill={onKillProcess}
        />
      ))}
    </div>
  );
});

ProcessListMobileView.displayName = 'ProcessListMobileView';

interface ProcessListDesktopViewProps {
  processes: ProcessInfo[];
  sortField: ProcessSortField;
  expandedPid: number | null;
  killingPid: number | null;
  onToggleExpanded: (pid: number) => void;
  onToggleSort: (field: ProcessSortField) => void;
  onKillProcess: (pid: number, signal: string) => void;
}

const ProcessListDesktopView = React.memo(function ProcessListDesktopView({
  processes,
  sortField,
  expandedPid,
  killingPid,
  onToggleExpanded,
  onToggleSort,
  onKillProcess,
}: ProcessListDesktopViewProps) {
  return (
    <div className="hidden sm:block overflow-x-auto">
      <table className="w-full text-left min-w-[800px]" aria-label="Processes">
        <caption className="sr-only">Processes</caption>
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            <th className="w-8 px-2" />
            <SortHeader field="pid" currentSort={sortField} onSort={onToggleSort}>
              PID
            </SortHeader>
            <SortHeader field="name" currentSort={sortField} onSort={onToggleSort}>
              Process
            </SortHeader>
            <SortHeader field="user" currentSort={sortField} onSort={onToggleSort}>
              User
            </SortHeader>
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">State</th>
            <SortHeader field="cpu" className="text-right" currentSort={sortField} onSort={onToggleSort}>
              CPU
            </SortHeader>
            <SortHeader field="mem" className="text-right" currentSort={sortField} onSort={onToggleSort}>
              Memory
            </SortHeader>
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">Uptime</th>
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right w-20">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => (
            <ProcessRow
              key={process.pid}
              process={process}
              isExpanded={expandedPid === process.pid}
              isKilling={killingPid === process.pid}
              onToggleExpand={onToggleExpanded}
              onKill={onKillProcess}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

ProcessListDesktopView.displayName = 'ProcessListDesktopView';

export const ProcessList = React.memo(function ProcessList({
  processes,
  sortField,
  expandedPid,
  killingPid,
  onToggleSort,
  onToggleExpanded,
  onKillProcess,
}: ProcessListProps) {
  const footer = <ProcessListFooter processCount={processes.length} sortField={sortField} />;

  if (processes.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <ProcessListEmptyState />
        {footer}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <ProcessListMobileView
        processes={processes}
        expandedPid={expandedPid}
        killingPid={killingPid}
        onToggleExpanded={onToggleExpanded}
        onKillProcess={onKillProcess}
      />
      <ProcessListDesktopView
        processes={processes}
        sortField={sortField}
        expandedPid={expandedPid}
        killingPid={killingPid}
        onToggleExpanded={onToggleExpanded}
        onToggleSort={onToggleSort}
        onKillProcess={onKillProcess}
      />

      {footer}
    </div>
  );
});

ProcessList.displayName = 'ProcessList';
