'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, CornerDownLeft, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildGlobalSearchItems,
  rankCommandSearchItems,
  type CommandSearchItem,
} from './commandSearchUtils';

interface CommandSearchProps {
  isOpen: boolean;
  onClose: () => void;
  items?: CommandSearchItem[];
}

export default function CommandSearch({ isOpen, onClose, items }: CommandSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchItems = useMemo(() => items ?? buildGlobalSearchItems(), [items]);
  const results = useMemo(
    () => rankCommandSearchItems(searchItems, query, 9),
    [query, searchItems]
  );

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
  }, [isOpen]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  };

  if (!isOpen) return null;

  const selectedItem = results[selectedIndex];

  const selectItem = (item: CommandSearchItem) => {
    router.push(item.href);
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter' && selectedItem) {
      event.preventDefault();
      selectItem(selectedItem);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-background/70 px-3 pt-[14vh] backdrop-blur-sm sm:px-6">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className="flex min-h-[56px] items-center gap-3 border-b border-border px-4">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-search-results"
            aria-activedescendant={selectedItem ? `command-search-${selectedItem.id}` : undefined}
            placeholder="Search modules, pages, and actions"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          id="command-search-results"
          role="listbox"
          className="max-h-[60vh] overflow-y-auto p-2"
        >
          {results.length > 0 ? (
            results.map((item, index) => {
              const Icon = item.icon;
              const selected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  id={`command-search-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => selectItem(item)}
                  className={cn(
                    'flex min-h-[56px] w-full items-center gap-3 rounded-md px-3 text-left transition-colors',
                    selected ? 'bg-accent text-accent-foreground' : 'text-popover-foreground'
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                    {Icon ? <Icon className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.group}
                    </span>
                  </span>
                  {selected && <CornerDownLeft className="h-4 w-4 text-muted-foreground" />}
                </button>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5" />
            Move
          </span>
          <span className="flex items-center gap-1.5">
            <CornerDownLeft className="h-3.5 w-3.5" />
            Open
          </span>
        </div>
      </div>
    </div>
  );
}
