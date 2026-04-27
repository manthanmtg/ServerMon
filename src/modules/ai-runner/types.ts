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
  | 'skipped'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'killed';
export type AIRunnerTrigger = 'manual' | 'schedule' | 'autoflow';
export type AIRunnerJobStatus =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'canceled';
export type AIRunnerAutoflowStatus = 'draft' | 'running' | 'completed' | 'failed' | 'canceled';
export type AIRunnerAutoflowItemStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'canceled';

export interface AIRunnerWorkspaceDTO {
  _id: string;
  name: string;
  path: string;
  blocking: boolean;
  enabled: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

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
  locked: boolean;
  lockedAt?: string;
  lockedUntil?: string;
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
  attachments: AIRunnerPromptAttachmentDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface AIRunnerPromptAttachmentDTO {
  name: string;
  contentType: string;
  size: number;
  data: string;
}

export interface AIRunnerPromptAttachmentRefDTO {
  name: string;
  path: string;
  contentType: string;
  size: number;
}

export interface AIRunnerPromptTemplateDTO {
  _id: string;
  name: string;
  content: string;
  description?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AIRunnerScheduleDTO {
  _id: string;
  name: string;
  promptId: string;
  agentProfileId: string;
  workspaceId?: string;
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
  autoflowMode: 'sequential' | 'parallel';
  artifactBaseDir: string;
  maxConcurrentRuns: number;
  mongoRetentionDays: number;
  artifactRetentionDays: number;
  defaultArtifactBaseDir: string;
  defaultMaxConcurrentRuns: number;
  defaultMongoRetentionDays: number;
  defaultArtifactRetentionDays: number;
  updatedAt?: string;
}

export interface AIRunnerArtifactPathsDTO {
  artifactDir: string;
  metadataPath: string;
  stdoutPath: string;
  stderrPath: string;
  combinedPath: string;
  exitPath: string;
  wrapperLogPath: string;
}

export interface AIRunnerArtifactOutputDTO {
  stdout: string;
  stderr: string;
  rawOutput: string;
  truncatedStdout: boolean;
  truncatedStderr: boolean;
  truncatedRaw: boolean;
}

export interface AIRunnerExecutionRefDTO {
  pid?: number;
  processGroupId?: number;
  unitName?: string;
}

export interface AIRunnerExecutionExitDTO {
  jobId: string;
  runId: string;
  exitCode: number | null;
  signal: string | null;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
}

export interface AIRunnerExecutionMetadataDTO {
  jobId: string;
  runId: string;
  command: string;
  shell: string;
  workingDirectory: string;
  promptId?: string;
  scheduleId?: string;
  autoflowId?: string;
  autoflowItemId?: string;
  agentProfileId: string;
  workspaceId?: string;
  timeoutMinutes: number;
  createdAt: string;
  executionRef?: AIRunnerExecutionRefDTO;
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
  autoflowId?: string;
  autoflowItemId?: string;
  agentProfileId: string;
  workspaceId?: string;
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
  artifactDir?: string;
  stdoutPath?: string;
  stderrPath?: string;
  combinedPath?: string;
  exitPath?: string;
  executionRef?: AIRunnerExecutionRefDTO;
  recoveryState?: string;
  lastRecoveryError?: string;
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
  attachments?: AIRunnerPromptAttachmentRefDTO[];
  agentProfileId?: string;
  workspaceId?: string;
  workingDirectory?: string;
  timeout?: number;
  scheduleId?: string;
  autoflowId?: string;
  autoflowItemId?: string;
  triggeredBy?: AIRunnerTrigger;
}

export interface AIRunnerRunsResponse {
  runs: AIRunnerRunDTO[];
  total: number;
}

export interface AIRunnerDirectoriesResponse {
  directories: string[];
}

export interface AIRunnerAutoflowItemDTO {
  _id?: string;
  name: string;
  promptId?: string;
  promptContent?: string;
  promptType: AIRunnerPromptType;
  attachments?: AIRunnerPromptAttachmentRefDTO[];
  agentProfileId: string;
  workspaceId?: string;
  workingDirectory: string;
  timeout: number;
  status: AIRunnerAutoflowItemStatus;
  runId?: string;
  lastError?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface AIRunnerAutoflowDTO {
  _id: string;
  name: string;
  description?: string;
  mode: 'sequential' | 'parallel';
  status: AIRunnerAutoflowStatus;
  continueOnFailure: boolean;
  currentIndex: number;
  items: AIRunnerAutoflowItemDTO[];
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AIRunnerPortableResource =
  | 'settings'
  | 'profiles'
  | 'workspaces'
  | 'prompts'
  | 'promptTemplates'
  | 'schedules';

export interface AIRunnerPortableProfile {
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
}

export interface AIRunnerPortableWorkspace {
  name: string;
  path: string;
  blocking: boolean;
  enabled: boolean;
  notes?: string;
}

export interface AIRunnerPortablePrompt {
  name: string;
  content: string;
  type: AIRunnerPromptType;
  tags: string[];
  attachments?: AIRunnerPromptAttachmentDTO[];
}

export interface AIRunnerPortablePromptTemplate {
  name: string;
  content: string;
  description?: string;
  tags: string[];
}

export interface AIRunnerPortableSchedule {
  name: string;
  promptName: string;
  agentProfileSlug: string;
  workspacePath?: string;
  workingDirectory: string;
  timeout: number;
  retries: number;
  cronExpression: string;
  enabled: boolean;
}

export interface AIRunnerPortableBundle {
  kind: 'servermon.ai-runner.bundle';
  version: 1;
  exportedAt: string;
  resources: {
    settings?: Pick<AIRunnerSettingsDTO, 'schedulesGloballyEnabled' | 'autoflowMode'> &
      Partial<Pick<AIRunnerSettingsDTO, 'maxConcurrentRuns'>>;
    profiles?: AIRunnerPortableProfile[];
    workspaces?: AIRunnerPortableWorkspace[];
    prompts?: AIRunnerPortablePrompt[];
    promptTemplates?: AIRunnerPortablePromptTemplate[];
    schedules?: AIRunnerPortableSchedule[];
  };
}

export interface AIRunnerImportConflictDTO {
  resource: AIRunnerPortableResource;
  key: string;
  label: string;
  existingId?: string;
  incomingSummary: string;
}

export interface AIRunnerImportPreviewDTO {
  valid: boolean;
  resources: Record<AIRunnerPortableResource, { incoming: number; conflicts: number }>;
  conflicts: AIRunnerImportConflictDTO[];
  missingReferences: string[];
}

export interface AIRunnerImportDecision {
  resource: AIRunnerPortableResource;
  key: string;
  overwrite: boolean;
}

export interface AIRunnerImportResultDTO extends AIRunnerImportPreviewDTO {
  imported: Record<AIRunnerPortableResource, { created: number; updated: number; skipped: number }>;
}
