'use client';

import { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TemplateListItem, TemplateCategory } from '../../types';
import { TemplateCard } from './TemplateCard';

const CATEGORIES: Array<{ value: TemplateCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'service', label: 'Services' },
  { value: 'cli-tool', label: 'CLI Tools' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'development', label: 'Development' },
  { value: 'database', label: 'Database' },
];

interface TemplateCatalogProps {
  templates: TemplateListItem[];
  onSelectTemplate: (template: TemplateListItem) => void;
}

export function TemplateCatalog({ templates, onSelectTemplate }: TemplateCatalogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');

  const filtered = useMemo(() => {
    let results = templates;

    if (selectedCategory !== 'all') {
      results = results.filter((t) => t.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q)),
      );
    }

    return results;
  }, [templates, selectedCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length };
    for (const t of templates) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    return counts;
  }, [templates]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.value] || 0;
            if (cat.value !== 'all' && count === 0) return null;
            return (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  selectedCategory === cat.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {cat.label}
                <span className="ml-1 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? `No templates matching "${searchQuery}"`
              : 'No templates in this category'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onClick={onSelectTemplate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
