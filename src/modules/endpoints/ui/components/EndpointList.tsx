'use client';

import { Search, RefreshCcw, Sparkles, Plus, Terminal, Braces, Globe, Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, relativeTime } from '@/lib/utils';
import { MethodBadge } from './common/MethodBadge';
import { EmptyState } from './common/EmptyState';
import { METHOD_COLORS, TYPE_ICONS, METHODS, TYPES } from './common/constants';
import type { CustomEndpointDTO } from '../../types';

interface EndpointListProps {
  endpoints: CustomEndpointDTO[];
  total: number;
  loading: boolean;
  refreshing: boolean;
  selectedId: string | null;
  showDetail: boolean;
  search: string;
  filterMethod: string;
  filterType: string;
  filterEnabled: string;
  onSearch: (val: string) => void;
  onFilterMethod: (val: string) => void;
  onFilterType: (val: string) => void;
  onFilterEnabled: (val: string) => void;
  onRefresh: () => void;
  onSelect: (ep: CustomEndpointDTO) => void;
  onCreate: () => void;
  onShowTemplates: () => void;
  onToggle: (id: string) => void;
  isResizing: boolean;
}

export function EndpointList({
  endpoints,
  total,
  loading,
  refreshing,
  selectedId,
  showDetail,
  search,
  filterMethod,
  filterType,
  filterEnabled,
  onSearch,
  onFilterMethod,
  onFilterType,
  onFilterEnabled,
  onRefresh,
  onSelect,
  onCreate,
  onShowTemplates,
  onToggle,
  isResizing,
}: EndpointListProps) {

  return (
    <div
      className={cn(
        'flex flex-col min-w-0 h-full',
        showDetail ? 'shrink-0 hidden lg:flex' : 'flex-1',
        !isResizing && 'transition-all duration-300'
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search endpoints..."
            className="w-full h-11 pl-10 pr-4 rounded-2xl border border-border/40 bg-background/50 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40 shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-11 w-11 p-0 rounded-2xl border-border/40 hover:bg-accent/50 shrink-0"
          >
            <RefreshCcw className={cn('w-4 h-4 text-muted-foreground', refreshing && 'animate-spin')} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onShowTemplates}
            className="h-11 flex-1 sm:flex-none gap-2 rounded-2xl font-bold px-4 sm:px-5 border-border/40 hover:bg-accent/50 text-foreground"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="inline">Templates</span>
          </Button>
          <Button
            size="sm"
            data-testid="new-endpoint-button"
            onClick={onCreate}
            className="h-11 flex-1 sm:flex-none gap-2 rounded-2xl font-bold px-4 sm:px-6 shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span className="inline">New</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 p-1 bg-muted/20 rounded-xl border border-border/40">
          <button
            onClick={() => onFilterMethod('')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all uppercase tracking-widest',
              filterMethod === ''
                ? 'bg-card text-foreground border-border shadow-sm'
                : 'border-transparent text-muted-foreground hover:bg-accent'
            )}
          >
            All
          </button>
          {METHODS.map((m) => {
            const colors = METHOD_COLORS[m];
            const active = filterMethod === m;
            return (
              <button
                key={m}
                onClick={() => onFilterMethod(active ? '' : m)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all',
                  active
                    ? `${colors.bg} ${colors.text} ${colors.border}`
                    : 'border-transparent text-muted-foreground hover:bg-accent'
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
        
        <div className="flex items-center gap-1.5 p-1 bg-muted/20 rounded-xl border border-border/40">
          <button
            onClick={() => onFilterType('')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all uppercase tracking-widest',
              filterType === ''
                ? 'bg-card text-foreground border-border shadow-sm'
                : 'border-transparent text-muted-foreground hover:bg-accent'
            )}
          >
            All
          </button>
          {TYPES.map((t) => {
            const active = filterType === t;
            const Icon = TYPE_ICONS[t];
            return (
              <button
                key={t}
                onClick={() => onFilterType(active ? '' : t)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-1.5 capitalize',
                  active
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'border-transparent text-muted-foreground hover:bg-accent'
                )}
              >
                <Icon className="w-3 h-3" />
                {t}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-muted/20 rounded-xl border border-border/40">
          <button
            onClick={() => onFilterEnabled('')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all uppercase tracking-widest',
              filterEnabled === ''
                ? 'bg-card text-foreground border-border shadow-sm'
                : 'border-transparent text-muted-foreground hover:bg-accent'
            )}
          >
            All
          </button>
          {(['true', 'false'] as const).map((val) => {
            const active = filterEnabled === val;
            return (
              <button
                key={val}
                onClick={() => onFilterEnabled(active ? '' : val)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center gap-2',
                  active
                    ? val === 'true'
                      ? 'bg-success/10 text-success border-success/30'
                      : 'bg-muted text-muted-foreground border-border'
                    : 'border-transparent text-muted-foreground hover:bg-accent'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    val === 'true' ? 'bg-success shadow-[0_0_8px_rgba(var(--success-rgb),0.6)]' : 'bg-muted-foreground/40'
                  )}
                />
                {val === 'true' ? 'Active' : 'Disabled'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Endpoint List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 custom-scrollbar" data-testid="endpoints-list">
        {endpoints.length === 0 && !loading ? (
          <EmptyState
            onCreateNew={onCreate}
            onFromTemplate={onShowTemplates}
          />
        ) : (
          endpoints.map((ep) => (
            <div
              key={ep._id}
              data-testid="endpoint-list-item"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(ep)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onSelect(ep);
                }
              }}
              className={cn(
                'w-full text-left p-4 rounded-2xl border transition-all group relative overflow-hidden cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selectedId === ep._id
                  ? 'bg-primary/5 border-primary/30 shadow-md ring-1 ring-primary/20'
                  : 'bg-card/50 border-border/40 hover:bg-accent/30 hover:border-border hover:shadow-sm'
              )}
            >
              {selectedId === ep._id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary animate-in slide-in-from-left-full duration-300" />
              )}
              <div className="flex items-center gap-3 mb-2">
                <MethodBadge method={ep.method} />
                <span className="text-sm font-bold text-foreground truncate flex-1 group-hover:text-primary transition-colors">
                  {ep.name}
                </span>
                {ep.auth === 'token' ? (
                  <span title="Protected: Requires Bearer Token">
                    <Lock 
                      className="w-3.5 h-3.5 text-success/80 shrink-0 drop-shadow-[0_0_8px_rgba(var(--success-rgb),0.4)]" 
                    />
                  </span>
                ) : (
                  <span title="Public: Accessible without authentication">
                    <LockOpen 
                      className="w-3.5 h-3.5 text-destructive/70 shrink-0 drop-shadow-[0_0_8px_rgba(var(--destructive-rgb),0.3)]" 
                    />
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  data-testid="endpoint-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(ep._id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      onToggle(ep._id);
                    }
                  }}
                  title={ep.enabled ? 'Disable' : 'Enable'}
                  className={cn(
                    'w-2 h-2 rounded-full shrink-0 cursor-pointer ring-4 ring-transparent hover:ring-muted/50 transition-all',
                    ep.enabled
                      ? 'bg-success shadow-[0_0_10px_rgba(var(--success-rgb),0.5)]'
                      : 'bg-muted-foreground/40'
                  )}
                />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                <code className="truncate flex-1 font-mono bg-muted/30 px-1.5 py-0.5 rounded leading-none">/api/endpoints/{ep.slug}</code>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70 mt-2">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-background/50 border border-border/40 font-bold uppercase tracking-tighter text-[9px] text-muted-foreground/80">
                    {ep.endpointType === 'script' ? (
                      <div className="flex items-center gap-1">
                        <Terminal className="w-2.5 h-2.5 text-primary/60" />
                        <span>{ep.scriptLang}</span>
                      </div>
                    ) : ep.endpointType === 'logic' ? (
                      <div className="flex items-center gap-1">
                        <Braces className="w-2.5 h-2.5 text-success/60" />
                        <span>Logic</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Globe className="w-2.5 h-2.5 text-warning/60" />
                        <span>Webhook</span>
                      </div>
                    )}
                  </div>
                  <span className="font-medium">{ep.executionCount.toLocaleString()} hits</span>
                </div>
              </div>
              {ep.lastExecutedAt && (
                <div className="text-[10px] text-muted-foreground/50 mt-2 flex items-center justify-between border-t border-border/20 pt-2">
                  <span>Last run {relativeTime(ep.lastExecutedAt)}</span>
                  {ep.lastStatus && (
                    <span
                      className={cn(
                        'font-mono font-bold',
                        ep.lastStatus < 400 ? 'text-success/80' : 'text-destructive/80'
                      )}
                    >
                      {ep.lastStatus}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="pt-4 border-t border-border/40 text-[10px] text-muted-foreground/60 text-center font-medium uppercase tracking-widest">
        {total} endpoint{total !== 1 ? 's' : ''} reported
      </div>
    </div>
  );
}
