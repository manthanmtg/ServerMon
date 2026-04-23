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
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'killed';
export type AIRunnerTrigger = 'manual' | 'schedule';
export type AIRunnerJobStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface AIRunnerProfileDTO {
  _id: string;
  name: string;
  slug: string;
  agentType: AIRunnerAgentType;
  invocationTemplate: string;
  defaultTimeout: number;
  maxTimeout: number;
  shell: string;
  requiresTTY: boolean;
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
  retries: number;
  cronExpression: string;
  enabled: boolean;
  lastRunId?: string;
  lastRunStatus?: AIRunnerRunStatus;
  lastRunAt?: string;
  lastScheduledFor?: string;
  nextRunTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIRunnerSettingsDTO {
  schedulesGloballyEnabled: boolean;
  updatedAt?: string;
}

export interface AIRunnerLogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  event: string;
  message: string;
  sessionId: string;
  pid: number;
  data?: Record<string, unknown>;
}

export interface AIRunnerLogsResponse {
  entries: AIRunnerLogEntry[];
  filePath: string;
  sessionId: string;
}

export interface AIRunnerResourceUsage {
  peakCpuPercent: number;
  peakMemoryBytes: number;
  peakMemoryPercent: number;
}

export interface AIRunnerRunDTO {
  _id: string;
  jobId?: string;
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
  queuedAt: string;
  scheduledFor?: string;
  dispatchedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  durationSeconds?: number;
  triggeredBy: AIRunnerTrigger;
  jobStatus?: AIRunnerJobStatus;
  attemptCount?: number;
  maxAttempts?: number;
  heartbeatAt?: string;
  lastOutputAt?: string;
  lastError?: string;
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
