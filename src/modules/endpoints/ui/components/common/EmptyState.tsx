'use client';

import { Waypoints, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onCreateNew: () => void;
  onFromTemplate: () => void;
}

export function EmptyState({ onCreateNew, onFromTemplate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(var(--primary-rgb),0.15)] border border-primary/20">
        <Waypoints className="w-10 h-10 text-primary" />
      </div>
      <h3 className="text-2xl font-bold text-foreground mb-3 tracking-tight">No endpoints yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-10 leading-relaxed">
        Create custom API endpoints that run scripts, proxy webhooks, or execute logic — all managed
        from here.
      </p>
      <div className="flex items-center gap-4">
        <Button
          onClick={onCreateNew}
          className="gap-2.5 h-12 px-6 rounded-2xl font-bold shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" />
          New Endpoint
        </Button>
        <Button
          variant="outline"
          onClick={onFromTemplate}
          className="gap-2.5 h-12 px-6 rounded-2xl font-bold border-border/60 hover:bg-accent/50 transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <Sparkles className="w-5 h-5" />
          From Template
        </Button>
      </div>
    </div>
  );
}
