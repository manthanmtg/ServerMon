import { access, readFile } from 'node:fs/promises';
import type {
  AIRunnerJobStatus,
  AIRunnerAutoflowDTO,
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerPromptTemplateDTO,
  AIRunnerRunDTO,
  AIRunnerRunStatus,
  AIRunnerScheduleDTO,
  AIRunnerTemplateValidationResult,
  AIRunnerTrigger,
  AIRunnerWorkspaceDTO,
} from '@/modules/ai-runner/types';
import type { IAIRunnerAutoflow } from '@/models/AIRunnerAutoflow';
import type { IAIRunnerJob } from '@/models/AIRunnerJob';
import type { IAIRunnerProfile } from '@/models/AIRunnerProfile';
import type { IAIRunnerPrompt } from '@/models/AIRunnerPrompt';
import type { IAIRunnerPromptTemplate } from '@/models/AIRunnerPromptTemplate';
import type { IAIRunnerRun } from '@/models/AIRunnerRun';
import type { IAIRunnerSchedule } from '@/models/AIRunnerSchedule';
import type { IAIRunnerWorkspace } from '@/models/AIRunnerWorkspace';
import { computeNextRuns } from '@/lib/crons/service';
import { encodeStoredPromptAttachment, normalizeAttachmentRefs } from './attachments';

export const DEFAULT_MAX_CONCURRENT_RUNS = 3;
export const MAX_CONCURRENT_RUNS_CAP = 8;
export const DEFAULT_OUTPUT_LIMIT = 1_000_000;
export const DEFAULT_SUPERVISOR_TICK_MS = 5_000;
export const DEFAULT_LEASE_TTL_MS = 20_000;
export const DEFAULT_HEARTBEAT_STALE_MS = 20_000;
export const DEFAULT_RETRY_DELAY_MS = 15_000;
export const DEFAULT_MAX_ATTEMPTS = 2;
export const MAX_SCHEDULE_CATCHUP_RUNS = 24;
export const LEASE_ID = 'airunner-supervisor';

export function getMaxConcurrentRuns(): number {
  const raw = Number(process.env.AI_RUNNER_MAX_CONCURRENT_RUNS ?? DEFAULT_MAX_CONCURRENT_RUNS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_CONCURRENT_RUNS;
  return Math.min(Math.max(Math.floor(raw), 1), MAX_CONCURRENT_RUNS_CAP);
}

export interface AIRunnerResolvedExecution {
  promptId?: string;
  scheduleId?: string;
  autoflowId?: string;
  autoflowItemId?: string;
  scheduleCronExpression?: string;
  profile: AIRunnerProfileDTO;
  workspaceId?: string;
  workspaceBlocking: boolean;
  promptContent: string;
  command: string;
  workingDirectory: string;
  timeoutMinutes: number;
  maxAttempts: number;
  triggeredBy: AIRunnerTrigger;
}

export interface AIRunnerWorkerBuffers {
  stdout: string;
  stderr: string;
  rawOutput: string;
  truncatedStdout: boolean;
  truncatedStderr: boolean;
  truncatedRaw: boolean;
}

export function stringifyId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return value.toString();
  }
  return String(value);
}

export function toIso(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

export function mapProfile(
  doc: IAIRunnerProfile | (Record<string, unknown> & { _id: unknown })
): AIRunnerProfileDTO {
  const envValue = doc.env instanceof Map ? Object.fromEntries(doc.env.entries()) : doc.env;
  return {
    _id: stringifyId(doc._id),
    name: String(doc.name),
    slug: String(doc.slug),
    agentType: doc.agentType as AIRunnerProfileDTO['agentType'],
    invocationTemplate: String(doc.invocationTemplate),
    defaultTimeout: Number(doc.defaultTimeout),
    maxTimeout: Number(doc.maxTimeout),
    shell: String(doc.shell),
    requiresTTY: Boolean(doc.requiresTTY),
    env: (envValue ?? {}) as Record<string, string>,
    enabled: Boolean(doc.enabled),
    icon: doc.icon ? String(doc.icon) : undefined,
    createdAt: new Date(doc.createdAt as Date | string).toISOString(),
    updatedAt: new Date(doc.updatedAt as Date | string).toISOString(),
  };
}

export function mapPrompt(
  doc: IAIRunnerPrompt | (Record<string, unknown> & { _id: unknown })
): AIRunnerPromptDTO {
  const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
  return {
    _id: stringifyId(doc._id),
    name: String(doc.name),
    content: String(doc.content),
    type: doc.type as AIRunnerPromptDTO['type'],
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
    attachments: attachments.map((attachment) =>
      encodeStoredPromptAttachment(attachment as Record<string, unknown>)
    ),
    createdAt: new Date(doc.createdAt as Date | string).toISOString(),
    updatedAt: new Date(doc.updatedAt as Date | string).toISOString(),
  };
}

export function mapPromptTemplate(
  doc: IAIRunnerPromptTemplate | (Record<string, unknown> & { _id: unknown })
): AIRunnerPromptTemplateDTO {
  return {
    _id: stringifyId(doc._id),
    name: String(doc.name),
    content: String(doc.content),
    description: doc.description ? String(doc.description) : undefined,
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
    createdAt: new Date(doc.createdAt as Date | string).toISOString(),
    updatedAt: new Date(doc.updatedAt as Date | string).toISOString(),
  };
}

export function mapWorkspace(
  doc: IAIRunnerWorkspace | (Record<string, unknown> & { _id: unknown })
): AIRunnerWorkspaceDTO {
  return {
    _id: stringifyId(doc._id),
    name: String(doc.name),
    path: String(doc.path),
    blocking: Boolean(doc.blocking),
    enabled: Boolean(doc.enabled),
    notes: doc.notes ? String(doc.notes) : undefined,
    createdAt: new Date(doc.createdAt as Date | string).toISOString(),
    updatedAt: new Date(doc.updatedAt as Date | string).toISOString(),
  };
}

export function mapSchedule(
  doc: IAIRunnerSchedule | (Record<string, unknown> & { _id: unknown })
): AIRunnerScheduleDTO {
  return {
    _id: stringifyId(doc._id),
    name: String(doc.name),
    promptId: stringifyId(doc.promptId),
    agentProfileId: doc.agentProfileId ? stringifyId(doc.agentProfileId) : '',
    workspaceId: doc.workspaceId ? stringifyId(doc.workspaceId) : undefined,
    workingDirectory: doc.workingDirectory ? String(doc.workingDirectory) : '',
    timeout: typeof doc.timeout === 'number' ? Number(doc.timeout) : 30,
    retries: typeof doc.retries === 'number' ? Number(doc.retries) : 1,
    cronExpression: String(doc.cronExpression),
    enabled: Boolean(doc.enabled),
    lastRunId: doc.lastRunId ? stringifyId(doc.lastRunId) : undefined,
    lastRunStatus: doc.lastRunStatus as AIRunnerScheduleDTO['lastRunStatus'],
    lastRunAt: toIso(doc.lastRunAt as Date | string | undefined),
    lastScheduledFor: toIso(doc.lastScheduledFor as Date | string | undefined),
    nextRunTime: toIso(doc.nextRunTime as Date | string | undefined),
    createdAt: new Date(doc.createdAt as Date | string).toISOString(),
    updatedAt: new Date(doc.updatedAt as Date | string).toISOString(),
  };
}

export function mapRun(
  doc: IAIRunnerRun | (Record<string, unknown> & { _id: unknown })
): AIRunnerRunDTO {
  const resourceUsage = doc.resourceUsage as
    | {
        peakCpuPercent?: number;
        peakMemoryBytes?: number;
        peakMemoryPercent?: number;
      }
    | undefined;

  return {
    _id: stringifyId(doc._id),
    jobId: doc.jobId ? stringifyId(doc.jobId) : undefined,
    promptId: doc.promptId ? stringifyId(doc.promptId) : undefined,
    scheduleId: doc.scheduleId ? stringifyId(doc.scheduleId) : undefined,
    autoflowId: doc.autoflowId ? stringifyId(doc.autoflowId) : undefined,
    autoflowItemId: doc.autoflowItemId ? stringifyId(doc.autoflowItemId) : undefined,
    agentProfileId: stringifyId(doc.agentProfileId),
    workspaceId: doc.workspaceId ? stringifyId(doc.workspaceId) : undefined,
    promptContent: String(doc.promptContent),
    workingDirectory: String(doc.workingDirectory),
    command: String(doc.command),
    pid: typeof doc.pid === 'number' ? doc.pid : undefined,
    status: doc.status as AIRunnerRunStatus,
    exitCode: typeof doc.exitCode === 'number' ? doc.exitCode : undefined,
    stdout: String(doc.stdout ?? ''),
    stderr: String(doc.stderr ?? ''),
    rawOutput: String(doc.rawOutput ?? ''),
    queuedAt:
      toIso(doc.queuedAt as Date | string | undefined) ??
      toIso(doc.startedAt as Date | string | undefined) ??
      new Date(doc.createdAt as Date | string).toISOString(),
    scheduledFor: toIso(doc.scheduledFor as Date | string | undefined),
    dispatchedAt: toIso(doc.dispatchedAt as Date | string | undefined),
    startedAt: toIso(doc.startedAt as Date | string | undefined),
    finishedAt: toIso(doc.finishedAt as Date | string | undefined),
    durationSeconds:
      typeof doc.durationSeconds === 'number' ? Number(doc.durationSeconds) : undefined,
    triggeredBy: doc.triggeredBy as AIRunnerTrigger,
    jobStatus: doc.jobStatus as AIRunnerJobStatus | undefined,
    attemptCount: typeof doc.attemptCount === 'number' ? Number(doc.attemptCount) : undefined,
    maxAttempts: typeof doc.maxAttempts === 'number' ? Number(doc.maxAttempts) : undefined,
    heartbeatAt: toIso(doc.heartbeatAt as Date | string | undefined),
    lastOutputAt: toIso(doc.lastOutputAt as Date | string | undefined),
    lastError: doc.lastError ? String(doc.lastError) : undefined,
    resourceUsage: resourceUsage
      ? {
          peakCpuPercent: Number(resourceUsage.peakCpuPercent ?? 0),
          peakMemoryBytes: Number(resourceUsage.peakMemoryBytes ?? 0),
          peakMemoryPercent: Number(resourceUsage.peakMemoryPercent ?? 0),
        }
      : undefined,
    artifactDir: doc.artifactDir ? String(doc.artifactDir) : undefined,
    stdoutPath: doc.stdoutPath ? String(doc.stdoutPath) : undefined,
    stderrPath: doc.stderrPath ? String(doc.stderrPath) : undefined,
    combinedPath: doc.combinedPath ? String(doc.combinedPath) : undefined,
    exitPath: doc.exitPath ? String(doc.exitPath) : undefined,
    executionRef:
      typeof doc.executionRef === 'object' && doc.executionRef !== null
        ? {
            pid:
              typeof (doc.executionRef as { pid?: unknown }).pid === 'number'
                ? Number((doc.executionRef as { pid?: unknown }).pid)
                : undefined,
            processGroupId:
              typeof (doc.executionRef as { processGroupId?: unknown }).processGroupId === 'number'
                ? Number((doc.executionRef as { processGroupId?: unknown }).processGroupId)
                : undefined,
            unitName: (doc.executionRef as { unitName?: unknown }).unitName
              ? String((doc.executionRef as { unitName?: unknown }).unitName)
              : undefined,
          }
        : undefined,
    recoveryState: doc.recoveryState ? String(doc.recoveryState) : undefined,
    lastRecoveryError: doc.lastRecoveryError ? String(doc.lastRecoveryError) : undefined,
  };
}

export function mapAutoflow(
  doc: IAIRunnerAutoflow | (Record<string, unknown> & { _id: unknown })
): AIRunnerAutoflowDTO {
  const items = Array.isArray(doc.items) ? doc.items : [];
  return {
    _id: stringifyId(doc._id),
    name: String(doc.name),
    description: doc.description ? String(doc.description) : undefined,
    mode: doc.mode === 'parallel' ? 'parallel' : 'sequential',
    status: doc.status as AIRunnerAutoflowDTO['status'],
    continueOnFailure: Boolean(doc.continueOnFailure),
    currentIndex: typeof doc.currentIndex === 'number' ? Number(doc.currentIndex) : 0,
    items: items.map((item) => ({
      _id: stringifyId((item as { _id?: unknown })._id),
      name: String(item.name),
      promptId: item.promptId ? stringifyId(item.promptId) : undefined,
      promptContent: item.promptContent ? String(item.promptContent) : undefined,
      promptType: item.promptType as AIRunnerAutoflowDTO['items'][number]['promptType'],
      attachments: normalizeAttachmentRefs(item.attachments),
      agentProfileId: stringifyId(item.agentProfileId),
      workspaceId: item.workspaceId ? stringifyId(item.workspaceId) : undefined,
      workingDirectory: String(item.workingDirectory),
      timeout: Number(item.timeout),
      status: item.status as AIRunnerAutoflowDTO['items'][number]['status'],
      runId: item.runId ? stringifyId(item.runId) : undefined,
      lastError: item.lastError ? String(item.lastError) : undefined,
      startedAt: toIso(item.startedAt as Date | string | undefined),
      finishedAt: toIso(item.finishedAt as Date | string | undefined),
    })),
    startedAt: toIso(doc.startedAt as Date | string | undefined),
    finishedAt: toIso(doc.finishedAt as Date | string | undefined),
    createdAt: new Date(doc.createdAt as Date | string).toISOString(),
    updatedAt: new Date(doc.updatedAt as Date | string).toISOString(),
  };
}

export function stripAnsi(input: string): string {
  return input
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B[@-_]/g, '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function replaceShellPlaceholder(template: string, name: string, value: string): string {
  const escapedValue = shellEscape(value);
  const quotedPlaceholder = new RegExp(`(["'])(\\$\\{${name}\\}|\\$${name})\\1`, 'g');
  return template
    .replace(quotedPlaceholder, escapedValue)
    .replaceAll(`\${${name}}`, escapedValue)
    .replaceAll(`$${name}`, escapedValue);
}

function hasBalancedDelimiters(template: string): boolean {
  let single = false;
  let double = false;
  let escaped = false;
  let subshellDepth = 0;

  for (let i = 0; i < template.length; i += 1) {
    const char = template[i];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (!double && char === "'") {
      single = !single;
      continue;
    }

    if (!single && char === '"') {
      double = !double;
      continue;
    }

    if (!single && !double && char === '$' && template[i + 1] === '(') {
      subshellDepth += 1;
      i += 1;
      continue;
    }

    if (!single && !double && char === ')' && subshellDepth > 0) {
      subshellDepth -= 1;
    }
  }

  return !single && !double && subshellDepth === 0;
}

function containsDangerousPattern(template: string): boolean {
  return /(rm\s+-rf\s+\/($|\s))|(mkfs\.)|(dd\s+if=.+of=\/dev\/)/i.test(template);
}

export async function validateProfileTemplate(input: {
  invocationTemplate: string;
  shell: string;
  execFileAsync: (
    file: string,
    args: string[],
    options: { timeout: number }
  ) => Promise<{ stdout: string; stderr: string }>;
}): Promise<AIRunnerTemplateValidationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (
    !input.invocationTemplate.includes('$PROMPT') &&
    !input.invocationTemplate.includes('${PROMPT}')
  ) {
    errors.push('Invocation template must include the $PROMPT placeholder');
  }

  if (!hasBalancedDelimiters(input.invocationTemplate)) {
    errors.push('Invocation template has unbalanced quotes or command substitutions');
  }

  if (containsDangerousPattern(input.invocationTemplate)) {
    errors.push('Invocation template contains a dangerous shell pattern');
  }

  if (
    !input.invocationTemplate.includes('$WORKING_DIR') &&
    !input.invocationTemplate.includes('${WORKING_DIR}')
  ) {
    warnings.push(
      'Template does not reference $WORKING_DIR; the run will still start in the configured directory'
    );
  }

  const previewCommand = resolveInvocationTemplate(
    input.invocationTemplate,
    'Sample prompt',
    '/tmp/example-repo'
  );

  if (errors.length === 0) {
    try {
      await input.execFileAsync(input.shell || '/bin/bash', ['-n', '-c', previewCommand], {
        timeout: 5000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown shell parse error';
      errors.push(`Shell validation failed: ${message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    previewCommand,
  };
}

export function resolveInvocationTemplate(
  template: string,
  prompt: string,
  workingDirectory: string
): string {
  return replaceShellPlaceholder(
    replaceShellPlaceholder(template, 'PROMPT', prompt),
    'WORKING_DIR',
    workingDirectory
  );
}

export function getNextRunTimeFromExpression(
  expression: string,
  now = new Date()
): string | undefined {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return undefined;
  const nextRuns = computeNextRuns(parts[0], parts[1], parts[2], parts[3], parts[4], 1, now);
  return nextRuns[0];
}

export function appendOutput(
  existing: string,
  chunk: string,
  maxChars: number,
  truncated: boolean
): { value: string; truncated: boolean } {
  if (truncated) return { value: existing, truncated };
  const next = `${existing}${chunk}`;
  if (next.length <= maxChars) {
    return { value: next, truncated: false };
  }
  const marker = '\n[output truncated]\n';
  return {
    value: `${next.slice(0, Math.max(0, maxChars - marker.length))}${marker}`,
    truncated: true,
  };
}

export function createEmptyBuffers(): AIRunnerWorkerBuffers {
  return {
    stdout: '',
    stderr: '',
    rawOutput: '',
    truncatedStdout: false,
    truncatedStderr: false,
    truncatedRaw: false,
  };
}

export async function ensureDirectoryExists(directory: string): Promise<void> {
  await access(directory);
}

export async function resolvePromptContent(
  type: 'inline' | 'file-reference',
  content: string
): Promise<string> {
  if (type === 'inline') return content;
  const rawPath = content.startsWith('@') ? content.slice(1) : content;
  return readFile(rawPath, 'utf8');
}

export function applyOutputChunk(
  buffers: AIRunnerWorkerBuffers,
  kind: 'stdout' | 'stderr',
  text: string,
  maxChars: number
): AIRunnerWorkerBuffers {
  const rawNext = appendOutput(buffers.rawOutput, text, maxChars, buffers.truncatedRaw);
  const cleanText = stripAnsi(text);
  if (kind === 'stdout') {
    const next = appendOutput(buffers.stdout, cleanText, maxChars, buffers.truncatedStdout);
    return {
      ...buffers,
      stdout: next.value,
      truncatedStdout: next.truncated,
      rawOutput: rawNext.value,
      truncatedRaw: rawNext.truncated,
    };
  }

  const next = appendOutput(buffers.stderr, cleanText, maxChars, buffers.truncatedStderr);
  return {
    ...buffers,
    stderr: next.value,
    truncatedStderr: next.truncated,
    rawOutput: rawNext.value,
    truncatedRaw: rawNext.truncated,
  };
}

export function shouldRetryJob(job: Pick<IAIRunnerJob, 'attemptCount' | 'maxAttempts'>): boolean {
  return job.attemptCount < job.maxAttempts;
}
