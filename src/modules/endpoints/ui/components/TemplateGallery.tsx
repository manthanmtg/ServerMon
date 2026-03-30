'use client';

import { X, Sparkles, Wand2, ChevronRight } from 'lucide-react';
import { MethodBadge } from './common/MethodBadge';
import { cn } from '@/lib/utils';
import type { EndpointTemplate } from '../../types';

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
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-background/40 backdrop-blur-md animate-in fade-in duration-500"
        onClick={onClose}
      />
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[2.5rem] border border-border/40 bg-card/95 backdrop-blur-2xl shadow-2xl p-6 sm:p-10 animate-in fade-in zoom-in-95 duration-500 overflow-hidden">
        
        <div className="flex items-center justify-between mb-8 relative z-10">
          <div className="flex items-center gap-4">
             <div className="p-3 rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                <Sparkles className="w-6 h-6 text-primary" />
             </div>
             <div>
               <h3 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">Endpoint Templates</h3>
               <p className="text-sm text-muted-foreground font-medium">Kickstart your development with pre-configured boilerplates</p>
             </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl hover:bg-accent/50 text-muted-foreground transition-all ring-1 ring-border/20 active:scale-95"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => onCreateFromTemplate(tmpl)}
                className="text-left p-6 rounded-3xl border border-border/40 bg-card/40 hover:border-primary/30 hover:bg-primary/5 hover:shadow-xl hover:shadow-primary/5 transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none -mr-4 -mt-4 group-hover:scale-125 transition-transform duration-700">
                   <Wand2 className="w-20 h-20 text-primary" />
                </div>

                <div className="flex items-center gap-4 mb-4 relative z-10">
                  <MethodBadge method={tmpl.method} size="lg" />
                  <span className="text-sm font-black text-foreground group-hover:text-primary transition-colors tracking-tight uppercase">
                    {tmpl.name}
                  </span>
                </div>
                
                <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed mb-6 relative z-10 font-medium">
                  {tmpl.description}
                </p>
                
                <div className="flex items-center gap-2 relative z-10">
                  {tmpl.scriptLang && (
                    <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-[10px] font-black font-mono text-primary uppercase tracking-widest border border-primary/10">
                      {tmpl.scriptLang}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-lg bg-muted/50 text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest border border-border/20">
                    {tmpl.endpointType}
                  </span>
                </div>

                 <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-primary uppercase tracking-[0.2em] bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                       INSTANTIATE
                       <ChevronRight className="w-3 h-3" />
                    </div>
                 </div>
              </button>
            ))}
          </div>
        </div>

        <div className="absolute top-0 right-0 p-24 opacity-[0.02] pointer-events-none -mr-20 -mt-20">
           <Sparkles className="w-64 h-64 text-primary animate-pulse" />
        </div>
      </div>
    </div>
  );
}
