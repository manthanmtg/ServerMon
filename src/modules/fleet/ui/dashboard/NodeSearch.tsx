'use client';
import { useState, useEffect, memo } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { NODE_STATUSES } from '@/lib/fleet/enums';

export interface NodeSearchValue {
  search: string;
  tag: string;
  status: string;
}

export const NodeSearch = memo(function NodeSearch({
  onChange,
  initial = { search: '', tag: '', status: '' },
}: {
  onChange: (v: NodeSearchValue) => void;
  initial?: NodeSearchValue;
}) {
  const [search, setSearch] = useState(initial.search);
  const [tag, setTag] = useState(initial.tag);
  const [status, setStatus] = useState(initial.status);

  useEffect(() => {
    const id = setTimeout(() => onChange({ search, tag, status }), 250);
    return () => clearTimeout(id);
  }, [search, tag, status, onChange]);

  return (
    <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          placeholder="Search by name, slug, description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>
      <Input
        placeholder="Tag filter"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        className="md:w-44 min-h-[44px] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-10 min-h-[44px] rounded-md border border-input bg-background px-3 text-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Status filter"
      >
        <option value="">All statuses</option>
        {NODE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
});
