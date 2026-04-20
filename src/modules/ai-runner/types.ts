export type AIRunnerAgentType =
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'aider'
  | 'gemini-cli'
  | 'custom';

export type AIRunnerPromptType = 'inline' | 'file-reference';
export type AIRunnerRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'killed';
export type AIRunnerTrigger = 'manual' | 'schedule';

export interface AIRunnerProfileDTO {
  _id: string;
  name: string;
  slug: string;
  agentType: AIRunnerAgentType;
  invocationTemplate: string;
  defaultTimeout: number;
  maxTimeout: number;
  shell: string;
  env: Record<string, string>;
  enabled: boolean;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIRunnerPromptDTO {
  _id: string;
  name: string;
  content: string;
  type: AIRunnerPromptType;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AIRunnerScheduleDTO {
  _id: string;
  name: string;
  promptId: string;
  agentProfileId: string;
  workingDirectory: string;
  timeout: number;
  cronExpression: string;
  enabled: boolean;
  lastRunId?: string;
  lastRunStatus?: AIRunnerRunStatus;
  lastRunAt?: string;
  nextRunTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIRunnerResourceUsage {
  peakCpuPercent: number;
  peakMemoryBytes: number;
  peakMemoryPercent: number;
}

export interface AIRunnerRunDTO {
  _id: string;
  promptId?: string;
  scheduleId?: string;
  agentProfileId: string;
  promptContent: string;
  workingDirectory: string;
  command: string;
  pid?: number;
  status: AIRunnerRunStatus;
  exitCode?: number;
  stdout: string;
  stderr: string;
  rawOutput: string;
  startedAt: string;
  finishedAt?: string;
  durationSeconds?: number;
  triggeredBy: AIRunnerTrigger;
  resourceUsage?: AIRunnerResourceUsage;
}

export interface AIRunnerTemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  previewCommand?: string;
}

export interface AIRunnerExecuteRequest {
  promptId?: string;
  name?: string;
  content?: string;
  type?: AIRunnerPromptType;
  agentProfileId?: string;
  workingDirectory?: string;
  timeout?: number;
  scheduleId?: string;
  triggeredBy?: AIRunnerTrigger;
}

export interface AIRunnerRunsResponse {
  runs: AIRunnerRunDTO[];
  total: number;
}

export interface AIRunnerDirectoriesResponse {
  directories: string[];
}
