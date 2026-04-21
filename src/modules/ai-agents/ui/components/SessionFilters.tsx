'use client';

import { memo } from 'react';
import { RefreshCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AgentType, SessionStatus } from '../../types';
import { AGENT_TYPES } from '../constants';

export type FilterStatus = 'all' | SessionStatus;
export type FilterAgent = 'all' | AgentType;

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  filterStatus: FilterStatus;
  onStatusChange: (value: FilterStatus) => void;
  filterAgent: FilterAgent;
  onAgentChange: (value: FilterAgent) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

function SessionFiltersInner({
  search,
  onSearchChange,
  filterStatus,
  onStatusChange,
  filterAgent,
  onAgentChange,
  onRefresh,
  refreshing,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search agents, repos, users..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-border bg-background placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <select
        value={filterStatus}
        onChange={(e) => onStatusChange(e.target.value as FilterStatus)}
        className="h-9 px-3 text-xs font-medium bg-secondary border border-border rounded-lg text-secondary-foreground outline-none cursor-pointer hover:bg-accent transition-colors"
      >
        <option value="all">All Status</option>
        <option value="running">Running</option>
        <option value="idle">Idle</option>
        <option value="waiting">Waiting</option>
        <option value="error">Error</option>
        <option value="completed">Completed</option>
      </select>

      <select
        value={filterAgent}
        onChange={(e) => onAgentChange(e.target.value as FilterAgent)}
        className="h-9 px-3 text-xs font-medium bg-secondary border border-border rounded-lg text-secondary-foreground outline-none cursor-pointer hover:bg-accent transition-colors"
      >
        <option value="all">All Agents</option>
        {AGENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <Button variant="outline" size="sm" onClick={onRefresh} loading={refreshing}>
        <RefreshCcw className="w-3.5 h-3.5" />
        Refresh
      </Button>
    </div>
  );
}

export const SessionFilters = memo(SessionFiltersInner);
