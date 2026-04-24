'use client';

import { Settings, X, Copy, Trash2, AlertTriangle, Clock, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EndpointCreateRequest, CustomEndpointDTO } from '../../types';

interface EndpointSettingsProps {
  form: EndpointCreateRequest;
  selectedEndpoint: CustomEndpointDTO | null;
  selectedId: string | null;
  isCreating: boolean;
  onUpdateForm: <K extends keyof EndpointCreateRequest>(
    key: K,
    value: EndpointCreateRequest[K]
  ) => void;
  onDuplicate: (id: string) => void;
  onDelete: (ep: CustomEndpointDTO) => void;
}

export function EndpointSettings({
  form,
  selectedEndpoint,
  selectedId,
  isCreating,
  onUpdateForm,
  onDuplicate,
  onDelete,
}: EndpointSettingsProps) {
  const timeoutMs = form.timeout || 30000;
  const timeoutSec = (timeoutMs / 1000).toFixed(0);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
      {/* Timeout */}
      <div className="space-y-6 p-6 rounded-3xl bg-card border border-border/40 shadow-sm overflow-hidden relative">
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-black text-foreground uppercase tracking-wider">
                Execution Timeout
              </label>
              <p className="text-[10px] text-muted-foreground font-medium lowercase italic">
                Termination threshold for script execution
              </p>
            </div>
          </div>
          <span className="text-sm font-black font-mono text-primary bg-primary/10 px-3 py-1 rounded-xl border border-primary/20">
            {timeoutSec}s
          </span>
        </div>

        <div className="space-y-4 px-2 relative z-10">
          <input
            type="range"
            min={1000}
            max={120000}
            step={1000}
            value={timeoutMs}
            onChange={(e) => onUpdateForm('timeout', Number(e.target.value))}
            className="w-full h-2 bg-muted/30 rounded-full appearance-none cursor-pointer accent-primary transition-all hover:accent-primary/80"
          />
          <div className="flex justify-between text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">
            <span>Minimum 1s</span>
            <span>Balanced 30s</span>
            <span>Maximum 120s</span>
          </div>
        </div>

        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none -mr-4 -mt-4">
          <Clock className="w-24 h-24" />
        </div>
      </div>

      {/* Response Headers */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10">
              <FileText className="w-4 h-4 text-blue-500" />
            </div>
            <div className="space-y-0.5">
              <label className="text-xs font-black text-foreground uppercase tracking-wider">
                Static Egress Headers
              </label>
              <p className="text-[10px] text-muted-foreground font-medium lowercase italic">
                Injected into all outbound HTTP responses
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              onUpdateForm('responseHeaders', { ...(form.responseHeaders || {}), '': '' })
            }
            className="text-[10px] font-black text-primary hover:text-primary/80 bg-primary/10 px-4 py-2 rounded-xl border border-primary/20 transition-all hover:scale-105 active:scale-95 uppercase tracking-widest"
          >
            + ADD HEADER
          </button>
        </div>

        <div className="space-y-3">
          {Object.entries(form.responseHeaders || {}).map(([key, value], i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-2 bg-muted/10 rounded-2xl border border-border/30 group/header animate-in slide-in-from-left-4 duration-300"
            >
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={key}
                  placeholder="X-Header-Name"
                  onChange={(e) => {
                    const entries = Object.entries(form.responseHeaders || {});
                    entries[i] = [e.target.value, value];
                    onUpdateForm('responseHeaders', Object.fromEntries(entries));
                  }}
                  className="flex-1 h-10 px-4 rounded-xl border border-border/40 bg-background/50 text-[11px] font-mono font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all"
                />
                <span className="text-muted-foreground/40 font-mono">:</span>
                <input
                  type="text"
                  value={value}
                  placeholder="Header value"
                  onChange={(e) => {
                    const entries = Object.entries(form.responseHeaders || {});
                    entries[i] = [key, e.target.value];
                    onUpdateForm('responseHeaders', Object.fromEntries(entries));
                  }}
                  className="flex-1 h-10 px-4 rounded-xl border border-border/40 bg-background/50 text-[11px] font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all"
                />
              </div>
              <button
                onClick={() => {
                  const entries = Object.entries(form.responseHeaders || {}).filter(
                    (_, j) => j !== i
                  );
                  onUpdateForm('responseHeaders', Object.fromEntries(entries));
                }}
                className="p-2.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                title="Remove header"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {Object.keys(form.responseHeaders || {}).length === 0 && (
            <div className="text-center py-10 rounded-[2.5rem] border border-dashed border-border/40 bg-muted/5 flex flex-col items-center gap-3">
              <Settings className="w-8 h-8 text-muted-foreground/20" />
              <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                No custom egress headers defined
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      {!isCreating && selectedEndpoint && (
        <div className="space-y-6 pt-10 border-t border-border/40">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 rounded-xl bg-destructive/10">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <div className="space-y-0.5">
              <h4 className="text-xs font-black text-destructive uppercase tracking-[0.2em]">
                Restricted Operations
              </h4>
              <p className="text-[10px] text-muted-foreground font-medium lowercase italic">
                Irreversible actions that impact endpoint availability
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 p-6 rounded-[2.5rem] bg-destructive/[0.02] border border-destructive/10 ring-1 ring-destructive/5 relative overflow-hidden">
            <div className="flex-1 min-w-0 relative z-10">
              <p className="text-xs font-bold text-foreground mb-1 uppercase tracking-tight">
                Endpoint Lifecycle
              </p>
              <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                Duplicate this configuration as a new template or terminate the endpoint
                permanently, purging all associated tokens and historical logs.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 relative z-10">
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedId && onDuplicate(selectedId)}
                className="h-11 gap-2.5 rounded-2xl text-xs font-bold px-6 border-border/40 hover:bg-accent/50 hover:border-border transition-all active:scale-95"
              >
                <Copy className="w-4 h-4 text-primary" />
                DUPLICATE
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(selectedEndpoint)}
                className="h-11 gap-2.5 rounded-2xl text-xs font-bold px-6 shadow-lg shadow-destructive/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Trash2 className="w-4 h-4" />
                TERMINATE
              </Button>
            </div>
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none -mr-4 -mt-4">
              <AlertTriangle className="w-24 h-24 text-destructive" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
