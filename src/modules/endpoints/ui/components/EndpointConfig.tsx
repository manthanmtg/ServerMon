'use client';

import { Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { METHOD_COLORS, TYPE_ICONS, METHODS, TYPES } from './common/constants';
import type { EndpointCreateRequest } from '../../types';

interface EndpointConfigProps {
  form: EndpointCreateRequest;
  onUpdateForm: <K extends keyof EndpointCreateRequest>(key: K, value: EndpointCreateRequest[K]) => void;
  autoSlugRef: React.MutableRefObject<boolean>;
}

export function EndpointConfig({ form, onUpdateForm, autoSlugRef }: EndpointConfigProps) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Slug */}
      <div className="space-y-3">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">
          Endpoint Slug
        </label>
        <div className="relative group">
          <input
            type="text"
            value={form.slug || ''}
            onChange={(e) => {
              autoSlugRef.current = false;
              onUpdateForm('slug', e.target.value);
            }}
            placeholder="my-awesome-endpoint"
            className="w-full h-12 px-4 rounded-2xl border border-border/40 bg-background/30 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm group-hover:bg-background/50"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40 font-mono opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            [a-z0-9-]
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-3">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">
          Description
        </label>
        <textarea
          value={form.description || ''}
          onChange={(e) => onUpdateForm('description', e.target.value)}
          placeholder="Briefly describe what this endpoint does..."
          rows={3}
          className="w-full px-4 py-3 rounded-2xl border border-border/40 bg-background/30 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none shadow-sm hover:bg-background/50"
        />
      </div>

      {/* Method */}
      <div className="space-y-3">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">
          HTTP Method
        </label>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => {
            const colors = METHOD_COLORS[m];
            const active = form.method === m;
            return (
              <button
                key={m}
                onClick={() => onUpdateForm('method', m)}
                data-testid={`method-${m}`}
                className={cn(
                  'px-6 py-2.5 rounded-2xl text-[11px] font-mono font-black border transition-all min-h-[48px] uppercase tracking-wider',
                  active
                    ? `${colors.bg} ${colors.text} ${colors.border} shadow-lg shadow-current/10 scale-[1.02]`
                    : 'border-border/40 text-muted-foreground hover:bg-accent/50 hover:border-border'
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Endpoint Type */}
      <div className="space-y-3">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">
          Execution Strategy
        </label>
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-muted/20 border border-border/40 rounded-3xl backdrop-blur-md shadow-inner">
          {TYPES.map((t) => {
            const Icon = TYPE_ICONS[t];
            const active = form.endpointType === t;
            return (
              <button
                key={t}
                onClick={() => onUpdateForm('endpointType', t)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 py-2.5 px-4 rounded-2xl text-[11px] font-bold transition-all duration-300 relative group',
                  active
                    ? 'bg-primary text-primary-foreground shadow-2xl shadow-primary/30 scale-[1.02]'
                    : 'text-muted-foreground/60 hover:text-foreground hover:bg-white/5 border border-transparent'
                )}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 transition-transform duration-500',
                    active ? 'scale-110 rotate-[360deg]' : 'group-hover:scale-110 opacity-50'
                  )}
                />
                <span className="capitalize tracking-tight">{t}</span>
                {active && (
                   <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full border-4 border-primary animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-3">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">
          Taxonomy Tags
        </label>
        <div className="flex flex-wrap gap-2 p-3 min-h-[56px] rounded-2xl border border-border/40 bg-background/20 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          {(form.tags || []).map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-bold text-primary group animate-in zoom-in-50 duration-300"
            >
              <Tag className="w-3.5 h-3.5" />
              {tag}
              <button
                onClick={() =>
                  onUpdateForm(
                    'tags',
                    (form.tags || []).filter((_, j) => j !== i)
                  )
                }
                className="ml-1 text-primary/40 hover:text-destructive hover:bg-destructive/10 p-0.5 rounded-md transition-colors"
                title="Remove tag"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
          <input
            type="text"
            placeholder="Type and press Enter to add tag..."
            className="flex-1 h-9 px-3 text-xs bg-transparent outline-none min-w-[200px] placeholder:text-muted-foreground/30"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                onUpdateForm('tags', [...(form.tags || []), e.currentTarget.value.trim()]);
                e.currentTarget.value = '';
              }
            }}
          />
        </div>
      </div>

      {/* Enabled Toggle */}
      <div className="flex items-center justify-between p-6 rounded-3xl bg-primary/2 border border-primary/10 shadow-sm transition-all hover:bg-primary/5 group">
        <div className="flex items-center gap-4">
          <div className={cn(
            "p-3 rounded-2xl transition-colors",
            form.enabled ? "bg-success/20" : "bg-muted-foreground/10"
          )}>
            <div className={cn(
              "w-3 h-3 rounded-full animate-pulse",
              form.enabled ? "bg-success shadow-[0_0_12px_rgba(var(--success-rgb),1)]" : "bg-muted-foreground shadow-none"
            )} />
          </div>
          <div>
            <div className="text-sm font-black text-foreground uppercase tracking-tight">Active Deployment</div>
            <div className="text-[11px] text-muted-foreground font-medium">Endpoint is globally accessible via the assigned slug</div>
          </div>
        </div>
        <button
          onClick={() => onUpdateForm('enabled', !form.enabled)}
          className={cn(
            'w-14 h-8 rounded-full transition-all relative shadow-inner p-1',
            form.enabled ? 'bg-success shadow-success/20' : 'bg-muted-foreground/20'
          )}
        >
          <div
            className={cn(
              'w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-300 transform',
              form.enabled ? 'translate-x-6' : 'translate-x-0'
            )}
          />
        </button>
      </div>
    </div>
  );
}
