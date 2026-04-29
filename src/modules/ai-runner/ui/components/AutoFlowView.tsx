'use client';

import { 
  Play, 
  Plus, 
  Square, 
  Upload, 
  X 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  AIRunnerAutoflowDTO,
  AIRunnerProfileDTO,
  AIRunnerPromptTemplateDTO,
  AIRunnerWorkspaceDTO,
} from '../types';
import type {
  AutoflowItemDraft,
} from '../types';
import { formatMemory } from '../utils';

interface AutoFlowViewProps {
  autoflowName: string;
  setAutoflowName: (name: string) => void;
  autoflowMode: 'sequential' | 'parallel';
  setAutoflowMode: (mode: 'sequential' | 'parallel') => void;
  autoflowDraft: AutoflowItemDraft;
  setAutoflowDraft: React.Dispatch<React.SetStateAction<AutoflowItemDraft>>;
  profiles: AIRunnerProfileDTO[];
  profileMap: Record<string, AIRunnerProfileDTO>;
  workspaces: AIRunnerWorkspaceDTO[];
  workspaceMap: Record<string, AIRunnerWorkspaceDTO>;
  promptTemplates: AIRunnerPromptTemplateDTO[];
  autoflowContinueOnFailure: boolean;
  setAutoflowContinueOnFailure: (continueOnFailure: boolean) => void;
  autoflowItems: AutoflowItemDraft[];
  setAutoflowItems: React.Dispatch<React.SetStateAction<AutoflowItemDraft[]>>;
  autoflows: AIRunnerAutoflowDTO[];
  uploadAutoflowAttachments: (fileList: FileList | null) => Promise<void>;
  removeAutoflowAttachment: (index: number) => void;
  addAutoflowItem: () => void;
  submitAutoflow: () => Promise<void>;
  startAutoflow: (id: string) => Promise<void>;
  cancelAutoflow: (id: string) => Promise<void>;
  revealHistoryRun: (runId: string) => Promise<void>;
  isActionPending: (key: string) => boolean;
  runExclusiveAction: (key: string, action: () => Promise<void>) => Promise<void>;
  hasAutoflowDraftPrompt: boolean;
  applyPromptTemplate: (template: string, current: string) => string;
  acceptAttachmentDrag: (event: React.DragEvent<HTMLElement>) => void;
  getDroppedAttachmentFiles: (event: React.DragEvent<HTMLElement>) => FileList | null;
}

export function AutoFlowView({
  autoflowName,
  setAutoflowName,
  autoflowMode,
  setAutoflowMode,
  autoflowDraft,
  setAutoflowDraft,
  profiles,
  profileMap,
  workspaces,
  workspaceMap,
  promptTemplates,
  autoflowContinueOnFailure,
  setAutoflowContinueOnFailure,
  autoflowItems,
  setAutoflowItems,
  autoflows,
  uploadAutoflowAttachments,
  removeAutoflowAttachment,
  addAutoflowItem,
  submitAutoflow,
  startAutoflow,
  cancelAutoflow,
  revealHistoryRun,
  isActionPending,
  runExclusiveAction,
  hasAutoflowDraftPrompt,
  applyPromptTemplate,
  acceptAttachmentDrag,
  getDroppedAttachmentFiles,
}: AutoFlowViewProps) {
  return (
    <div
      id="runner-tab-autoflows"
      role="tabpanel"
      aria-labelledby="tab-autoflows"
      className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]"
    >
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-sm">AutoFlow Builder</CardTitle>
          <CardDescription>
            Queue a chain of prompts. Sequential mode waits for each step; parallel mode
            still respects blocking workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <Input
              label="AutoFlow Name"
              value={autoflowName}
              onChange={(event) => setAutoflowName(event.target.value)}
              placeholder="ServerMon cleanup wave"
            />
            <label className="space-y-1.5">
              <span className="block text-sm font-medium">Run Mode</span>
              <select
                value={autoflowMode}
                onChange={(event) =>
                  setAutoflowMode(event.target.value as typeof autoflowMode)
                }
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="sequential">Sequential</option>
                <option value="parallel">Parallel</option>
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_200px_180px]">
              <Input
                label="Step Name"
                value={autoflowDraft.name}
                onChange={(event) =>
                  setAutoflowDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Patch tests"
              />
              <label className="space-y-1.5">
                <span className="block text-sm font-medium">Profile</span>
                <select
                  value={autoflowDraft.agentProfileId}
                  onChange={(event) => {
                    const profile = profileMap[event.target.value];
                    setAutoflowDraft((current) => ({
                      ...current,
                      agentProfileId: event.target.value,
                      timeout: profile?.defaultTimeout ?? current.timeout,
                    }));
                  }}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="">Select profile</option>
                  {profiles
                    .filter((profile) => profile.enabled)
                    .map((profile) => (
                      <option key={profile._id} value={profile._id}>
                        {profile.name}
                      </option>
                    ))}
                </select>
              </label>
              <Input
                label="Timeout"
                type="number"
                value={autoflowDraft.timeout}
                onChange={(event) =>
                  setAutoflowDraft((current) => ({
                    ...current,
                    timeout: Number(event.target.value) || 1,
                  }))
                }
                min={1}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <label className="space-y-1.5">
                <span className="block text-sm font-medium">Workspace</span>
                <select
                  value={autoflowDraft.workspaceId ?? ''}
                  onChange={(event) => {
                    const workspace = workspaceMap[event.target.value];
                    setAutoflowDraft((current) => ({
                      ...current,
                      workspaceId: event.target.value || undefined,
                      workingDirectory: workspace?.path ?? current.workingDirectory,
                    }));
                  }}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="">Custom path</option>
                  {workspaces
                    .filter((workspace) => workspace.enabled)
                    .map((workspace) => (
                      <option key={workspace._id} value={workspace._id}>
                        {workspace.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="space-y-1.5">
                <span className="block text-sm font-medium">Workspace Path</span>
                <input
                  list="runner-directories"
                  value={autoflowDraft.workingDirectory}
                  onChange={(event) =>
                    setAutoflowDraft((current) => ({
                      ...current,
                      workspaceId:
                        workspaces.find(
                          (workspace: AIRunnerWorkspaceDTO) => workspace.path === event.target.value
                        )?._id ?? undefined,
                      workingDirectory: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                Prompt
                {promptTemplates.length > 0 ? (
                  <select
                    aria-label="Load prompt template into AutoFlow step"
                    onChange={(event) => {
                      const template = promptTemplates.find(
                        (item) => item._id === event.target.value
                      );
                      if (!template) return;
                      setAutoflowDraft((current) => ({
                        ...current,
                        promptId: undefined,
                        promptContent: applyPromptTemplate(
                          template.content,
                          current.promptContent ?? ''
                        ),
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
              </span>
              <textarea
                value={autoflowDraft.promptContent ?? ''}
                onChange={(event) =>
                  setAutoflowDraft((current) => ({
                    ...current,
                    promptId: undefined,
                    promptContent: event.target.value,
                  }))
                }
                className="min-h-44 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>

            <div
              role="region"
              aria-label="Ad-hoc prompt attachments"
              onDragEnter={acceptAttachmentDrag}
              onDragOver={acceptAttachmentDrag}
              onDrop={(event) => {
                void uploadAutoflowAttachments(getDroppedAttachmentFiles(event));
              }}
              className="space-y-3 rounded-xl border border-dashed border-border/70 bg-background/70 p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Step files & images</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Uploaded to temp storage and passed to this ad-hoc step by path. Drop
                    files here or use upload.
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
                      void uploadAutoflowAttachments(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
              {(autoflowDraft.attachments ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(autoflowDraft.attachments ?? []).map((attachment, index) => (
                    <div
                      key={`${attachment.path}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        {attachment.name}
                        <span className="ml-2 text-muted-foreground">
                          {formatMemory(attachment.size)}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeAutoflowAttachment(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoflowContinueOnFailure}
                  onChange={(event) => setAutoflowContinueOnFailure(event.target.checked)}
                />
                Continue after failed step
              </label>
              <Button variant="outline" onClick={addAutoflowItem}>
                <Plus className="w-4 h-4" />
                Add Step
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {autoflowItems.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {index + 1}. {item.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {profileMap[item.agentProfileId]?.name || 'Unknown profile'} ·{' '}
                    {item.workspaceId
                      ? workspaceMap[item.workspaceId]?.name || item.workingDirectory
                      : item.workingDirectory}
                  </p>
                  {(item.attachments ?? []).length > 0 ? (
                    <Badge variant="outline" className="mt-2 text-[10px]">
                      {(item.attachments ?? []).length} files
                    </Badge>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setAutoflowItems((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            {autoflowItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Start the current draft as a one-step AutoFlow, or add steps to build a
                larger queue.
              </div>
            ) : null}
          </div>

          <Button
            size="lg"
            disabled={autoflowItems.length === 0 && !hasAutoflowDraftPrompt}
            onClick={() => void runExclusiveAction('autoflow:submit', submitAutoflow)}
            loading={isActionPending('autoflow:submit')}
          >
            <Play className="w-4 h-4" />
            Start AutoFlow
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/60">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-sm">AutoFlow Runs</CardTitle>
          <CardDescription>
            Status across multi-step prompt queues and their generated runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {autoflows.map((autoflow) => (
            <div
              key={autoflow._id}
              className="border-b border-border/60 px-5 py-4 last:border-b-0"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{autoflow.name}</h3>
                    <Badge
                      variant={
                        autoflow.status === 'completed'
                          ? 'success'
                          : autoflow.status === 'failed'
                            ? 'destructive'
                            : autoflow.status === 'running'
                              ? 'default'
                              : 'outline'
                      }
                    >
                      {autoflow.status}
                    </Badge>
                    <Badge variant="outline">{autoflow.mode}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {autoflow.items.filter((item) => item.status === 'completed').length}/
                    {autoflow.items.length} complete
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {autoflow.status !== 'running' ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        void runExclusiveAction(`autoflow:start:${autoflow._id}`, () =>
                          startAutoflow(autoflow._id)
                        )
                      }
                      loading={isActionPending(`autoflow:start:${autoflow._id}`)}
                    >
                      <Play className="w-4 h-4" />
                      Restart
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        void runExclusiveAction(`autoflow:cancel:${autoflow._id}`, () =>
                          cancelAutoflow(autoflow._id)
                        )
                      }
                      loading={isActionPending(`autoflow:cancel:${autoflow._id}`)}
                    >
                      <Square className="w-4 h-4" />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {autoflow.items.map((item, index) => (
                  <button
                    type="button"
                    key={item._id ?? `${autoflow._id}-${index}`}
                    disabled={!item.runId}
                    onClick={() => {
                      if (item.runId) void revealHistoryRun(item.runId);
                    }}
                    className={cn(
                      'grid min-h-10 w-full gap-2 rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-left text-xs transition-colors sm:grid-cols-[32px_1fr_100px]',
                      item.runId
                        ? 'cursor-pointer hover:border-primary/40 hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-ring/40'
                        : 'cursor-default'
                    )}
                    title={item.runId ? 'Open this step in history' : 'No history run yet'}
                  >
                    <span className="text-muted-foreground">#{index + 1}</span>
                    <span className="min-w-0 truncate">{item.name}</span>
                    <Badge variant="outline">{item.status}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {autoflows.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              No AutoFlows yet.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
