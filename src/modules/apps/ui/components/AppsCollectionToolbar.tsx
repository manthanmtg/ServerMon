'use client';

import { LayoutGrid, List, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppsCollectionFilter } from '../appPresentation';

export type AppsCollectionView = 'grid' | 'list';

interface AppsCollectionToolbarProps {
  query: string;
  filter: AppsCollectionFilter;
  view: AppsCollectionView;
  resultCount: number;
  totalCount: number;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: AppsCollectionFilter) => void;
  onViewChange: (view: AppsCollectionView) => void;
}

const filters: Array<{ id: AppsCollectionFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'busy', label: 'Busy' },
];

export function AppsCollectionToolbar({
  query,
  filter,
  view,
  resultCount,
  totalCount,
  onQueryChange,
  onFilterChange,
  onViewChange,
}: AppsCollectionToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            role="searchbox"
            aria-label="Search apps"
            placeholder="Search apps, domains, or source…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-input bg-background py-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {resultCount} of {totalCount} apps
          </p>
          <div
            className="flex rounded-lg border border-border bg-muted/30 p-1"
            aria-label="Apps view"
          >
            <Button
              type="button"
              size="icon"
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => onViewChange('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={view === 'list' ? 'secondary' : 'ghost'}
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => onViewChange('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Filter apps">
        {filters.map((entry) => (
          <Button
            key={entry.id}
            type="button"
            size="sm"
            variant={filter === entry.id ? 'secondary' : 'ghost'}
            aria-pressed={filter === entry.id}
            onClick={() => onFilterChange(entry.id)}
          >
            {entry.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
