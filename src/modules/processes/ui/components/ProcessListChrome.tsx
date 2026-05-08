import { SearchX } from 'lucide-react';
import type { ProcessSortField } from '../types';

interface ProcessListFooterProps {
  processCount: number;
  sortField: ProcessSortField;
}

export function ProcessListFooter({ processCount, sortField }: ProcessListFooterProps) {
  return (
    <div className="px-4 py-2.5 border-t border-border bg-secondary/30 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-muted-foreground">
        {processCount} processes · sorted by {sortField}
      </span>
      <span className="text-xs text-muted-foreground">Auto-refreshes every 5s</span>
    </div>
  );
}

export function ProcessListEmptyState() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">No processes found</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Try a different search or refresh the list.
      </p>
    </div>
  );
}
