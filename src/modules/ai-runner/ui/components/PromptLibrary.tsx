'use client';

import React from 'react';
import { Play, Save, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AIRunnerPromptDTO } from '../../types';

interface PromptLibraryProps {
  prompts: AIRunnerPromptDTO[];
  selectedPromptId: string | null;
  setSelectedPromptId: (id: string | null) => void;
  onOpenCreateModal: () => void;
  onOpenInAutoflow: (id: string) => void;
  onSelectForEdit: (prompt: AIRunnerPromptDTO) => void;
  onDelete: (id: string) => Promise<void>;
  isActionPending: (key: string) => boolean;
}

export const PromptLibrary = React.memo(function PromptLibrary({
  prompts,
  selectedPromptId,
  setSelectedPromptId,
  onOpenCreateModal,
  onOpenInAutoflow,
  onSelectForEdit,
  onDelete,
  isActionPending,
}: PromptLibraryProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={onOpenCreateModal} className="shrink-0">
          <Save className="w-4 h-4" />
          Create Prompt
        </Button>
      </div>

      <div>
        <Card className="overflow-hidden border-border/60">
          <CardHeader className="border-b border-border/60">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle className="text-lg tracking-tight">Library</CardTitle>
              </div>
              <Badge variant="outline">{prompts.length} saved</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {prompts.map((prompt) => (
              <div
                key={prompt._id}
                onClick={() => setSelectedPromptId(prompt._id)}
                className={cn(
                  'border-b border-border/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/20',
                  selectedPromptId === prompt._id && 'bg-primary/5'
                )}
              >
                <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_auto] lg:items-center">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold tracking-tight">{prompt.name}</h3>
                      <Badge variant="secondary">{prompt.type}</Badge>
                      {prompt.attachments.length > 0 ? (
                        <Badge variant="outline">{prompt.attachments.length} files</Badge>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">
                      {prompt.content}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {prompt.tags.length > 0 ? (
                      prompt.tags.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {prompt.content.length} chars
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedPromptId(prompt._id);
                      }}
                    >
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenInAutoflow(prompt._id);
                      }}
                    >
                      <Play className="w-4 h-4" />
                      Run
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectForEdit(prompt);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onDelete(prompt._id);
                      }}
                      loading={isActionPending(`prompt:delete:${prompt._id}`)}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {prompts.length === 0 && (
              <div className="px-6 py-14 text-center">
                <h3 className="text-lg font-semibold tracking-tight">
                  No prompts in the library yet
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create a reusable prompt and it will show up here ready for runs and schedules.
                </p>
                <div className="mt-5">
                  <Button onClick={onOpenCreateModal}>
                    <Save className="w-4 h-4" />
                    Create Prompt
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
