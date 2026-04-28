'use client';

import React from 'react';
import { Save, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  formatMemory,
  applyPromptTemplate,
  getDroppedAttachmentFiles,
  acceptAttachmentDrag,
} from '../utils';
import type { AIRunnerPromptTemplateDTO, AIRunnerPromptAttachmentDTO } from '../../types';
import type { PromptFormState } from '../types';

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPromptId: string | null;
  promptForm: PromptFormState;
  setPromptForm: React.Dispatch<React.SetStateAction<PromptFormState>>;
  promptTemplates: AIRunnerPromptTemplateDTO[];
  isSaving: boolean;
  onSave: () => Promise<void>;
  onReset: () => void;
  addAttachments: (fileList: FileList | null) => Promise<void>;
  removeAttachment: (index: number) => void;
}

export function PromptModal({
  isOpen,
  onClose,
  editingPromptId,
  promptForm,
  setPromptForm,
  promptTemplates,
  isSaving,
  onSave,
  onReset,
  addAttachments,
  removeAttachment,
}: PromptModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-primary/20 bg-card/95 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-primary/80">Prompt Studio</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">
              {editingPromptId ? 'Edit prompt' : 'Create prompt'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Write the prompt once, tag it clearly, and keep it portable across runs and schedules.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Close prompt modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-6">
          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-6">
              <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold">Identity</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Give this prompt a strong name so it reads clearly in libraries and launch
                    flows.
                  </p>
                </div>
                <Input
                  label="Name"
                  value={promptForm.name}
                  onChange={(event) =>
                    setPromptForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <Input
                  label="Tags (comma separated)"
                  value={promptForm.tags.join(', ')}
                  onChange={(event) =>
                    setPromptForm((current) => ({
                      ...current,
                      tags: event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }))
                  }
                />
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                  Execution settings live in AutoFlow and schedules, so this prompt stays reusable
                  across profiles and repos.
                </div>
              </div>

              <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold">Storage Mode</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose whether this prompt lives inline or points to a file on disk.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={promptForm.type === 'inline' ? 'default' : 'outline'}
                    onClick={() => setPromptForm((current) => ({ ...current, type: 'inline' }))}
                  >
                    Inline
                  </Button>
                  <Button
                    size="sm"
                    variant={promptForm.type === 'file-reference' ? 'default' : 'outline'}
                    onClick={() =>
                      setPromptForm((current) => ({
                        ...current,
                        type: 'file-reference',
                      }))
                    }
                  >
                    File Reference
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">
                    {promptForm.type === 'inline' ? 'Prompt Content' : 'Prompt File Path'}
                  </p>
                  {promptForm.type === 'inline' && promptTemplates.length > 0 ? (
                    <select
                      aria-label="Load prompt template into saved prompt"
                      onChange={(event) => {
                        const template = promptTemplates.find(
                          (item) => item._id === event.target.value
                        );
                        if (!template) return;
                        setPromptForm((current) => ({
                          ...current,
                          content: applyPromptTemplate(template.content, current.content),
                        }));
                        event.target.value = '';
                      }}
                      className="h-9 max-w-[260px] rounded-lg border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      <option value="">Load template...</option>
                      {promptTemplates.map((template) => (
                        <option key={template._id} value={template._id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {promptForm.type === 'inline'
                    ? 'Draft the actual reusable instruction here.'
                    : 'Reference a prompt file path that should be loaded at run time.'}
                </p>
              </div>
              <textarea
                value={promptForm.content}
                onChange={(event) =>
                  setPromptForm((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
                className="min-h-[420px] w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder={
                  promptForm.type === 'inline'
                    ? 'Ask the agent to review code, prepare a changelog, refactor a module, or anything else you want to save for reuse...'
                    : '/root/repos/project/prompts/release-review.md'
                }
              />
              <div
                role="region"
                aria-label="Saved prompt attachments"
                onDragEnter={acceptAttachmentDrag}
                onDragOver={acceptAttachmentDrag}
                onDrop={(event) => {
                  void addAttachments(getDroppedAttachmentFiles(event));
                }}
                className="space-y-3 rounded-xl border border-dashed border-border/70 bg-card/60 p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Files & images</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Stored with this saved prompt and exported with prompt bundles. Drop files
                      here or use upload.
                    </p>
                  </div>
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/50">
                    <Upload className="h-4 w-4" />
                    Upload
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        void addAttachments(event.target.files);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
                {promptForm.attachments.length > 0 ? (
                  <div className="space-y-2">
                    {promptForm.attachments.map(
                      (attachment: AIRunnerPromptAttachmentDTO, index: number) => (
                        <div
                          key={`${attachment.name}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs"
                        >
                          <span className="min-w-0 truncate">
                            {attachment.name}
                            <span className="ml-2 text-muted-foreground">
                              {formatMemory(attachment.size)}
                            </span>
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => removeAttachment(index)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-border/60 bg-background/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onReset}>
              Reset
            </Button>
            <Button onClick={onSave} loading={isSaving}>
              <Save className="w-4 h-4" />
              {editingPromptId ? 'Update prompt' : 'Create prompt'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
