'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  X, Sparkles, Wand2, ChevronRight, SlidersHorizontal, RotateCcw,
  Activity, Shield, Wrench, Plug, Database, Globe, SearchX,
} from 'lucide-react';
import { MethodBadge } from './common/MethodBadge';
import { cn } from '@/lib/utils';
import type { EndpointTemplate, TemplateCategory, HttpMethod, EndpointType } from '../../types';

const CATEGORY_META: Record<TemplateCategory, { label: string; icon: React.ReactNode; color: string }> = {
  monitoring:    { label: 'Monitoring',    icon: <Activity className="w-3.5 h-3.5" />,  color: 'text-emerald-400' },
  security:      { label: 'Security',      icon: <Shield className="w-3.5 h-3.5" />,    color: 'text-rose-400' },
  devops:        { label: 'DevOps',        icon: <Wrench className="w-3.5 h-3.5" />,    color: 'text-amber-400' },
  integrations:  { label: 'Integrations',  icon: <Plug className="w-3.5 h-3.5" />,      color: 'text-violet-400' },
  data:          { label: 'Data',          icon: <Database className="w-3.5 h-3.5" />,   color: 'text-sky-400' },
  networking:    { label: 'Networking',    icon: <Globe className="w-3.5 h-3.5" />,      color: 'text-orange-400' },
};

const CATEGORY_ORDER: TemplateCategory[] = ['monitoring', 'security', 'devops', 'integrations', 'data', 'networking'];
const ALL_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ALL_TYPES: EndpointType[] = ['script', 'logic', 'webhook'];

interface TemplateGalleryProps {
  templates: EndpointTemplate[];
  onClose: () => void;
  onCreateFromTemplate: (tmpl: EndpointTemplate) => void;
}

export function TemplateGallery({
  templates,
  onClose,
  onCreateFromTemplate,
}: TemplateGalleryProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [filterMethod, setFilterMethod] = useState<HttpMethod | ''>('');
  const [filterType, setFilterType] = useState<EndpointType | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  const availableCategories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category));
    return CATEGORY_ORDER.filter((c) => cats.has(c));
  }, [templates]);

  const availableMethods = useMemo(() => {
    const methods = new Set(templates.map((t) => t.method));
    return ALL_METHODS.filter((m) => methods.has(m));
  }, [templates]);

  const availableTypes = useMemo(() => {
    const types = new Set(templates.map((t) => t.endpointType));
    return ALL_TYPES.filter((t) => types.has(t));
  }, [templates]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (activeCategory !== 'all' && t.category !== activeCategory) return false;
      if (filterMethod && t.method !== filterMethod) return false;
      if (filterType && t.endpointType !== filterType) return false;
      return true;
    });
  }, [templates, activeCategory, filterMethod, filterType]);

  const hasActiveFilters = filterMethod !== '' || filterType !== '';

  const clearFilters = useCallback(() => {
    setFilterMethod('');
    setFilterType('');
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-6">
      <div
        className="absolute inset-0 bg-background/40 backdrop-blur-md animate-in fade-in duration-500"
        onClick={onClose}
      />

      {/* Modal — full-height sheet on mobile, centered card on desktop */}
      <div className={cn(
        'relative w-full flex flex-col bg-card/95 backdrop-blur-2xl shadow-2xl animate-in fade-in duration-500 overflow-hidden',
        'h-[95dvh] rounded-t-[2rem] sm:rounded-[2.5rem] sm:max-w-5xl sm:max-h-[90vh] sm:h-auto',
        'border-t border-border/40 sm:border sm:border-border/40',
        'p-4 pt-3 sm:p-8 sm:pt-8',
      )}>
        
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 relative z-10 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
             <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
             </div>
             <div className="min-w-0">
               <h3 className="text-lg sm:text-2xl font-black text-foreground uppercase tracking-tight truncate">Templates</h3>
               <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                 {filtered.length} of {templates.length} boilerplates
               </p>
             </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'p-2.5 rounded-xl transition-all ring-1 active:scale-95 sm:hidden',
                showFilters
                  ? 'bg-primary/10 text-primary ring-primary/20'
                  : 'hover:bg-accent/50 text-muted-foreground ring-border/20'
              )}
            >
              <SlidersHorizontal className="w-5 h-5" />
              {hasActiveFilters && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl hover:bg-accent/50 text-muted-foreground transition-all ring-1 ring-border/20 active:scale-95"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="relative z-10 mb-3 sm:mb-4 shrink-0">
          <div className="flex gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl bg-muted/30 border border-border/20 overflow-x-auto no-scrollbar">
            {/* "All" tab */}
            <button
              onClick={() => setActiveCategory('all')}
              className={cn(
                'flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap',
                activeCategory === 'all'
                  ? 'bg-card shadow-lg shadow-black/5 ring-1 ring-border/30 text-foreground'
                  : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-card/40'
              )}
            >
              All
              <span className={cn(
                'px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black tabular-nums',
                activeCategory === 'all'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted/50 text-muted-foreground/40'
              )}>
                {templates.length}
              </span>
            </button>
            {availableCategories.map((cat) => {
              const meta = CATEGORY_META[cat];
              const count = templates.filter((t) => t.category === cat).length;
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap',
                    isActive
                      ? 'bg-card shadow-lg shadow-black/5 ring-1 ring-border/30 text-foreground'
                      : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-card/40'
                  )}
                >
                  <span className={cn(isActive ? meta.color : 'text-current opacity-50', 'transition-colors')}>
                    {meta.icon}
                  </span>
                  <span className="hidden xs:inline">{meta.label}</span>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black tabular-nums',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted/50 text-muted-foreground/40'
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter Bar — always visible on desktop, toggleable on mobile */}
        <div className={cn(
          'relative z-10 mb-3 sm:mb-4 shrink-0 overflow-hidden transition-all duration-300',
          showFilters ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 sm:max-h-40 sm:opacity-100'
        )}>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:items-center">
            {/* Method filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest shrink-0 w-14 sm:w-auto">Method</span>
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                {availableMethods.map((m) => {
                  const isActive = filterMethod === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setFilterMethod(isActive ? '' : m)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-95',
                        isActive
                          ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
                          : 'bg-muted/30 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Type filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest shrink-0 w-14 sm:w-auto">Type</span>
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                {availableTypes.map((t) => {
                  const isActive = filterType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setFilterType(isActive ? '' : t)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-95',
                        isActive
                          ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
                          : 'bg-muted/30 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Clear button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 hover:text-foreground bg-muted/20 hover:bg-muted/40 transition-all active:scale-95 self-start sm:self-auto"
              >
                <RotateCcw className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 custom-scrollbar relative z-10 min-h-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="p-4 rounded-2xl bg-muted/20 ring-1 ring-border/10">
                <SearchX className="w-8 h-8 text-muted-foreground/30" />
              </div>
              <div>
                <p className="text-sm font-bold text-muted-foreground/60">No templates match</p>
                <p className="text-xs text-muted-foreground/40 mt-1">Try adjusting your filters or category</p>
              </div>
              <button
                onClick={() => { setActiveCategory('all'); clearFilters(); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-primary bg-primary/10 hover:bg-primary/15 transition-all active:scale-95 ring-1 ring-primary/20"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset all filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {filtered.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => onCreateFromTemplate(tmpl)}
                  className="text-left p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-border/40 bg-card/40 hover:border-primary/30 hover:bg-primary/5 hover:shadow-xl hover:shadow-primary/5 transition-all group relative overflow-hidden active:scale-[0.98]"
                >
                  <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none -mr-4 -mt-4 group-hover:scale-125 transition-transform duration-700">
                     <Wand2 className="w-14 sm:w-16 h-14 sm:h-16 text-primary" />
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-3 relative z-10">
                    <MethodBadge method={tmpl.method} size="lg" />
                    <span className="text-[11px] sm:text-xs font-black text-foreground group-hover:text-primary transition-colors tracking-tight uppercase line-clamp-1">
                      {tmpl.name}
                    </span>
                  </div>
                  
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground/80 line-clamp-2 leading-relaxed mb-3 sm:mb-4 relative z-10 font-medium">
                    {tmpl.description}
                  </p>
                  
                  <div className="flex items-center gap-1.5 relative z-10 flex-wrap">
                    {tmpl.scriptLang && (
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-[8px] sm:text-[9px] font-black font-mono text-primary uppercase tracking-widest border border-primary/10">
                        {tmpl.scriptLang}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-muted/50 text-[8px] sm:text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest border border-border/20">
                      {tmpl.endpointType}
                    </span>
                    {activeCategory === 'all' && (
                      <span className={cn(
                        'px-2 py-0.5 rounded-md text-[8px] sm:text-[9px] font-black uppercase tracking-widest border border-border/10 bg-muted/30',
                        CATEGORY_META[tmpl.category]?.color || 'text-muted-foreground/40'
                      )}>
                        {CATEGORY_META[tmpl.category]?.label}
                      </span>
                    )}
                  </div>

                   <div className="absolute bottom-4 sm:bottom-5 right-4 sm:right-5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0 hidden sm:block">
                      <div className="flex items-center gap-1 text-[9px] font-black text-primary uppercase tracking-[0.2em] bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                         USE
                         <ChevronRight className="w-3 h-3" />
                      </div>
                   </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="absolute top-0 right-0 p-24 opacity-[0.02] pointer-events-none -mr-20 -mt-20">
           <Sparkles className="w-64 h-64 text-primary animate-pulse" />
        </div>
      </div>
    </div>
  );
}
