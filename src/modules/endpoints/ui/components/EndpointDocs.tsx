'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Eye, Pencil, BookOpen, LoaderCircle } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type { EndpointCreateRequest } from '../../types';

const MarkdownEditor = dynamic(() => import('./MarkdownEditor'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] rounded-2xl border border-border/40 bg-[#1e1e2e] flex items-center justify-center shadow-xl">
      <LoaderCircle className="w-6 h-6 animate-spin text-primary/40" />
    </div>
  ),
});

interface EndpointDocsProps {
  form: EndpointCreateRequest;
  onUpdateForm: <K extends keyof EndpointCreateRequest>(key: K, value: EndpointCreateRequest[K]) => void;
  onSave: () => void;
}

export function EndpointDocs({ form, onUpdateForm, onSave }: EndpointDocsProps) {
  const [mode, setMode] = useState<'edit' | 'view'>(form.docs ? 'view' : 'edit');
  const content = form.docs || '';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black text-foreground uppercase tracking-tight">Documentation</h3>
            <p className="text-[10px] text-muted-foreground/60 font-medium">
              {mode === 'edit' ? 'Editing markdown' : `${content.length.toLocaleString()} chars`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/30 border border-border/20">
          <button
            onClick={() => setMode('edit')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all',
              mode === 'edit'
                ? 'bg-card shadow-md ring-1 ring-border/30 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            )}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          <button
            onClick={() => setMode('view')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all',
              mode === 'view'
                ? 'bg-card shadow-md ring-1 ring-border/30 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            )}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
        </div>
      </div>

      {/* Editor */}
      {mode === 'edit' && (
        <div className="group relative animate-in fade-in duration-300">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
          <div className="relative">
            <MarkdownEditor
              value={content}
              onChange={(val: string) => onUpdateForm('docs', val)}
              onSave={onSave}
              height="500px"
            />
          </div>
        </div>
      )}

      {/* Preview */}
      {mode === 'view' && (
        <div className="animate-in fade-in duration-300">
          {content.trim() ? (
            <div className="rounded-2xl border border-border/40 bg-card/40 p-6 sm:p-8 shadow-xl overflow-auto max-h-[600px] custom-scrollbar">
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tight prose-h1:text-xl prose-h1:border-b prose-h1:border-border/20 prose-h1:pb-3 prose-h1:mb-6 prose-h2:text-base prose-h2:text-primary prose-h3:text-sm prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:text-[13px] prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:font-bold prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[#1e1e2e] prose-pre:border prose-pre:border-border/40 prose-pre:rounded-xl prose-pre:shadow-lg prose-strong:text-foreground prose-ul:text-muted-foreground prose-ol:text-muted-foreground prose-li:text-[13px] prose-table:text-[13px] prose-th:text-foreground prose-th:font-black prose-th:uppercase prose-th:tracking-wider prose-th:text-[10px] prose-td:text-muted-foreground prose-hr:border-border/20 prose-blockquote:border-primary/30 prose-blockquote:text-muted-foreground/80 prose-blockquote:not-italic">
                <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-border/40 text-center gap-4">
              <div className="p-4 rounded-2xl bg-muted/20 ring-1 ring-border/10">
                <BookOpen className="w-8 h-8 text-muted-foreground/20" />
              </div>
              <div>
                <p className="text-sm font-bold text-muted-foreground/50">No documentation yet</p>
                <p className="text-xs text-muted-foreground/30 mt-1">Switch to Edit mode to start writing</p>
              </div>
              <button
                onClick={() => setMode('edit')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-primary bg-primary/10 hover:bg-primary/15 transition-all active:scale-95 ring-1 ring-primary/20"
              >
                <Pencil className="w-3.5 h-3.5" />
                Start writing
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
