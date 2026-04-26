import type {
  AIRunnerAutoflowItemDTO,
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerPromptTemplateDTO,
  AIRunnerScheduleDTO,
  AIRunnerWorkspaceDTO,
} from '../types';

export type ViewTab = 'prompts' | 'schedules' | 'autoflows' | 'history' | 'settings' | 'logs';

export type HistoryDetailSection = 'summary' | 'output' | 'command' | 'metadata' | 'resources';

export type ProfileFormState = Omit<AIRunnerProfileDTO, '_id' | 'createdAt' | 'updatedAt'>;

export type PromptFormState = Omit<AIRunnerPromptDTO, '_id' | 'createdAt' | 'updatedAt'>;
export type PromptTemplateFormState = Omit<
  AIRunnerPromptTemplateDTO,
  '_id' | 'createdAt' | 'updatedAt'
>;
export type WorkspaceFormState = Omit<AIRunnerWorkspaceDTO, '_id' | 'createdAt' | 'updatedAt'>;

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
