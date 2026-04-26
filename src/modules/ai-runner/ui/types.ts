import type {
  AIRunnerAutoflowItemDTO,
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerPromptTemplateDTO,
  AIRunnerScheduleDTO,
  AIRunnerWorkspaceDTO,
} from '../types';

export type ViewTab =
  | 'run'
  | 'prompts'
  | 'schedules'
  | 'autoflows'
  | 'history'
  | 'settings'
  | 'logs';

export type HistoryDetailSection = 'summary' | 'output' | 'command' | 'metadata' | 'resources';

export type ProfileFormState = Omit<AIRunnerProfileDTO, '_id' | 'createdAt' | 'updatedAt'>;

export type PromptFormState = Omit<AIRunnerPromptDTO, '_id' | 'createdAt' | 'updatedAt'>;
export type PromptTemplateFormState = Omit<
  AIRunnerPromptTemplateDTO,
  '_id' | 'createdAt' | 'updatedAt'
>;
export type WorkspaceFormState = Omit<AIRunnerWorkspaceDTO, '_id' | 'createdAt' | 'updatedAt'>;

export type RunFormState = {
  name: string;
  content: string;
  type: 'inline' | 'file-reference' | 'saved-prompt';
  promptId?: string;
  agentProfileId: string;
  workspaceId?: string;
  workingDirectory: string;
  timeout: number;
};

export type ScheduleFormState = Omit<
  AIRunnerScheduleDTO,
  '_id' | 'createdAt' | 'updatedAt' | 'lastRunId' | 'lastRunStatus' | 'lastRunAt' | 'nextRunTime'
>;

export type AutoflowItemDraft = Omit<
  AIRunnerAutoflowItemDTO,
  '_id' | 'status' | 'runId' | 'lastError' | 'startedAt' | 'finishedAt'
>;

export type IconPresetKey =
  | 'bot'
  | 'zap'
  | 'terminal'
  | 'calendar'
  | 'history'
  | 'folder'
  | 'settings'
  | 'sparkles';

export type ScheduleBuilderMode = 'every' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'advanced';
