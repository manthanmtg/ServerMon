import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile } from 'node:fs/promises';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import AIRunnerProfile, { type IAIRunnerProfile } from '@/models/AIRunnerProfile';
import AIRunnerPrompt, { type IAIRunnerPrompt } from '@/models/AIRunnerPrompt';
import AIRunnerSchedule, { type IAIRunnerSchedule } from '@/models/AIRunnerSchedule';
import AIRunnerRun, { type IAIRunnerRun } from '@/models/AIRunnerRun';
import { computeNextRuns } from '@/lib/crons/service';
import { getProcessResourceUsage } from '@/lib/ai-agents/process-utils';
import type {
  AIRunnerDirectoriesResponse,
  AIRunnerExecuteRequest,
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerRunDTO,
  AIRunnerRunStatus,
  AIRunnerScheduleDTO,
  AIRunnerTemplateValidationResult,
  AIRunnerTrigger,
} from '@/modules/ai-runner/types';

const execFileAsync = promisify(execFile);
const log = createLogger('ai-runner');

const DEFAULT_MAX_CONCURRENT_RUNS = 3;
const DEFAULT_OUTPUT_LIMIT = 1_000_000;
const DEFAULT_SCHEDULER_INTERVAL_MS = 30_000;

interface ActiveRunState {
  pid: number;
  runId: string;
  scheduleId?: string;
  killedBy: 'timeout' | 'user' | null;
  stdout: string;
  stderr: string;
  rawOutput: string;
  truncatedStdout: boolean;
  truncatedStderr: boolean;
  truncatedRaw: boolean;
  timeoutHandle: NodeJS.Timeout;
  usageHandle: NodeJS.Timeout;
  peakCpuPercent: number;
  peakMemoryBytes: number;
  peakMemoryPercent: number;
  startedAt: number;
}

interface LegacyPromptRuntime {
  agentProfileId?: unknown;
  workingDirectory?: string;
  timeout?: number;
}

export interface AIRunnerServiceOptions {
  startScheduler?: boolean;
  schedulerIntervalMs?: number;
  maxConcurrentRuns?: number;
  maxOutputChars?: number;
}

function stringifyId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return value.toString();
  }
  return String(value);
}

function toIso(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function mapProfile(
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
    env: (envValue ?? {}) as Record<string, string>,
    enabled: Boolean(doc.enabled),
    icon: doc.icon ? String(doc.icon) : undefined,
    createdAt: new Date(doc.createdAt as Date | string).toISOString(),
    updatedAt: new Date(doc.updatedAt as Date | string).toISOString(),
  };
}

function mapPrompt(
  doc: IAIRunnerPrompt | (Record<string, unknown> & { _id: unknown })
): AIRunnerPromptDTO {
  return {
    _id: stringifyId(doc._id),
    name: String(doc.name),
    content: String(doc.content),
    type: doc.type as AIRunnerPromptDTO['type'],
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
    createdAt: new Date(doc.createdAt as Date | string).toISOString(),
    updatedAt: new Date(doc.updatedAt as Date | string).toISOString(),
  };
}

function mapSchedule(
  doc: IAIRunnerSchedule | (Record<string, unknown> & { _id: unknown })
): AIRunnerScheduleDTO {
  return {
    _id: stringifyId(doc._id),
    name: String(doc.name),
    promptId: stringifyId(doc.promptId),
    agentProfileId: doc.agentProfileId ? stringifyId(doc.agentProfileId) : '',
    workingDirectory: doc.workingDirectory ? String(doc.workingDirectory) : '',
    timeout: typeof doc.timeout === 'number' ? Number(doc.timeout) : 30,
    cronExpression: String(doc.cronExpression),
    enabled: Boolean(doc.enabled),
    lastRunId: doc.lastRunId ? stringifyId(doc.lastRunId) : undefined,
    lastRunStatus: doc.lastRunStatus as AIRunnerScheduleDTO['lastRunStatus'],
    lastRunAt: toIso(doc.lastRunAt as Date | string | undefined),
    nextRunTime: toIso(doc.nextRunTime as Date | string | undefined),
    createdAt: new Date(doc.createdAt as Date | string).toISOString(),
    updatedAt: new Date(doc.updatedAt as Date | string).toISOString(),
  };
}

function mapRun(doc: IAIRunnerRun | (Record<string, unknown> & { _id: unknown })): AIRunnerRunDTO {
  const resourceUsage = doc.resourceUsage as
    | {
        peakCpuPercent?: number;
        peakMemoryBytes?: number;
        peakMemoryPercent?: number;
      }
    | undefined;

  return {
    _id: stringifyId(doc._id),
    promptId: doc.promptId ? stringifyId(doc.promptId) : undefined,
    scheduleId: doc.scheduleId ? stringifyId(doc.scheduleId) : undefined,
    agentProfileId: stringifyId(doc.agentProfileId),
    promptContent: String(doc.promptContent),
    workingDirectory: String(doc.workingDirectory),
    command: String(doc.command),
    pid: typeof doc.pid === 'number' ? doc.pid : undefined,
    status: doc.status as AIRunnerRunStatus,
    exitCode: typeof doc.exitCode === 'number' ? doc.exitCode : undefined,
    stdout: String(doc.stdout ?? ''),
    stderr: String(doc.stderr ?? ''),
    rawOutput: String(doc.rawOutput ?? ''),
    startedAt: new Date(doc.startedAt as Date | string).toISOString(),
    finishedAt: toIso(doc.finishedAt as Date | string | undefined),
    durationSeconds:
      typeof doc.durationSeconds === 'number' ? Number(doc.durationSeconds) : undefined,
    triggeredBy: doc.triggeredBy as AIRunnerTrigger,
    resourceUsage: resourceUsage
      ? {
          peakCpuPercent: Number(resourceUsage.peakCpuPercent ?? 0),
          peakMemoryBytes: Number(resourceUsage.peakMemoryBytes ?? 0),
          peakMemoryPercent: Number(resourceUsage.peakMemoryPercent ?? 0),
        }
      : undefined,
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

function hasBalancedDelimiters(template: string): boolean {
  let single = false;
  let double = false;
  let escaped = false;
  let subshellDepth = 0;

  for (let i = 0; i < template.length; i++) {
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
      subshellDepth++;
      i++;
      continue;
    }

    if (!single && !double && char === ')' && subshellDepth > 0) {
      subshellDepth--;
    }
  }

  return !single && !double && subshellDepth === 0;
}

function containsDangerousPattern(template: string): boolean {
  return /(rm\s+-rf\s+\/($|\s))|(mkfs\.)|(dd\s+if=.+of=\/dev\/)/i.test(template);
}

export function resolveInvocationTemplate(
  template: string,
  prompt: string,
  workingDirectory: string
): string {
  const escapedPrompt = shellEscape(prompt);
  const escapedWorkingDir = shellEscape(workingDirectory);
  return template
    .replaceAll('${PROMPT}', escapedPrompt)
    .replaceAll('$PROMPT', escapedPrompt)
    .replaceAll('${WORKING_DIR}', escapedWorkingDir)
    .replaceAll('$WORKING_DIR', escapedWorkingDir);
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

function appendOutput(
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

async function ensureDirectoryExists(directory: string): Promise<void> {
  await access(directory);
}

async function resolvePromptContent(
  type: 'inline' | 'file-reference',
  content: string
): Promise<string> {
  if (type === 'inline') return content;
  const rawPath = content.startsWith('@') ? content.slice(1) : content;
  const fileContent = await readFile(rawPath, 'utf8');
  return fileContent;
}

export class AIRunnerService {
  private readonly activeRuns = new Map<string, ActiveRunState>();
  private readonly schedulerIntervalMs: number;
  private readonly maxConcurrentRuns: number;
  private readonly maxOutputChars: number;
  private schedulerHandle: NodeJS.Timeout | null = null;
  private schedulerBusy = false;

  constructor(options: AIRunnerServiceOptions = {}) {
    this.schedulerIntervalMs = options.schedulerIntervalMs ?? DEFAULT_SCHEDULER_INTERVAL_MS;
    this.maxConcurrentRuns = options.maxConcurrentRuns ?? DEFAULT_MAX_CONCURRENT_RUNS;
    this.maxOutputChars = options.maxOutputChars ?? DEFAULT_OUTPUT_LIMIT;

    if (options.startScheduler !== false && process.env.NODE_ENV !== 'test') {
      this.startScheduler();
    }
  }

  startScheduler(): void {
    if (this.schedulerHandle) return;
    this.schedulerHandle = setInterval(() => {
      void this.tickScheduler();
    }, this.schedulerIntervalMs);
    if ('unref' in this.schedulerHandle) {
      this.schedulerHandle.unref();
    }
  }

  stopScheduler(): void {
    if (!this.schedulerHandle) return;
    clearInterval(this.schedulerHandle);
    this.schedulerHandle = null;
  }

  async validateProfileTemplate(input: {
    invocationTemplate: string;
    shell: string;
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
        await execFileAsync(input.shell || '/bin/bash', ['-n', '-c', previewCommand], {
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

  async listProfiles(): Promise<AIRunnerProfileDTO[]> {
    await connectDB();
    const docs = await AIRunnerProfile.find().sort({ enabled: -1, updatedAt: -1 });
    return docs.map(mapProfile);
  }

  async getProfile(id: string): Promise<AIRunnerProfileDTO | null> {
    await connectDB();
    const doc = await AIRunnerProfile.findById(id);
    return doc ? mapProfile(doc) : null;
  }

  async createProfile(
    input: Omit<AIRunnerProfileDTO, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<AIRunnerProfileDTO> {
    await connectDB();
    const validation = await this.validateProfileTemplate({
      invocationTemplate: input.invocationTemplate,
      shell: input.shell,
    });
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }
    const doc = await AIRunnerProfile.create(input);
    return mapProfile(doc);
  }

  async updateProfile(
    id: string,
    input: Partial<Omit<AIRunnerProfileDTO, '_id' | 'createdAt' | 'updatedAt'>>
  ): Promise<AIRunnerProfileDTO | null> {
    await connectDB();
    const existing = await AIRunnerProfile.findById(id);
    if (!existing) return null;
    const merged = {
      invocationTemplate: input.invocationTemplate ?? existing.invocationTemplate,
      shell: input.shell ?? existing.shell,
    };
    const validation = await this.validateProfileTemplate(merged);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    Object.assign(existing, input);
    await existing.save();
    return mapProfile(existing);
  }

  async deleteProfile(id: string): Promise<boolean> {
    await connectDB();
    const inUseCount = await AIRunnerSchedule.countDocuments({ agentProfileId: id });
    if (inUseCount > 0) {
      throw new Error('Cannot delete a profile that is still referenced by schedules');
    }
    const result = await AIRunnerProfile.findByIdAndDelete(id);
    return Boolean(result);
  }

  async testProfile(id: string): Promise<AIRunnerRunDTO> {
    await connectDB();
    const profile = await AIRunnerProfile.findById(id);
    if (!profile) {
      throw new Error('Profile not found');
    }
    return this.executeRun({
      content: 'Reply with exactly the word ok and then exit.',
      type: 'inline',
      agentProfileId: stringifyId(profile._id),
      workingDirectory: process.cwd(),
      timeout: Math.min(profile.defaultTimeout, 5),
      triggeredBy: 'manual',
    });
  }

  async listPrompts(): Promise<AIRunnerPromptDTO[]> {
    await connectDB();
    const docs = await AIRunnerPrompt.find().sort({ updatedAt: -1 });
    return docs.map(mapPrompt);
  }

  async getPrompt(id: string): Promise<AIRunnerPromptDTO | null> {
    await connectDB();
    const doc = await AIRunnerPrompt.findById(id);
    return doc ? mapPrompt(doc) : null;
  }

  async createPrompt(
    input: Omit<AIRunnerPromptDTO, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<AIRunnerPromptDTO> {
    await connectDB();
    const doc = await AIRunnerPrompt.create(input);
    return mapPrompt(doc);
  }

  async updatePrompt(
    id: string,
    input: Partial<Omit<AIRunnerPromptDTO, '_id' | 'createdAt' | 'updatedAt'>>
  ): Promise<AIRunnerPromptDTO | null> {
    await connectDB();
    const doc = await AIRunnerPrompt.findByIdAndUpdate(id, input, { new: true });
    return doc ? mapPrompt(doc) : null;
  }

  async deletePrompt(id: string): Promise<boolean> {
    await connectDB();
    const scheduleCount = await AIRunnerSchedule.countDocuments({ promptId: id });
    if (scheduleCount > 0) {
      throw new Error('Cannot delete a prompt that is still referenced by schedules');
    }
    const result = await AIRunnerPrompt.findByIdAndDelete(id);
    return Boolean(result);
  }

  async listSchedules(options?: {
    enabled?: boolean;
    limit?: number;
  }): Promise<AIRunnerScheduleDTO[]> {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (typeof options?.enabled === 'boolean') {
      filter.enabled = options.enabled;
    }
    const query = AIRunnerSchedule.find(filter).sort({
      enabled: -1,
      nextRunTime: 1,
      updatedAt: -1,
    });
    if (options?.limit) query.limit(options.limit);
    const docs = await query;
    return docs.map(mapSchedule);
  }

  async createSchedule(
    input: Omit<AIRunnerScheduleDTO, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<AIRunnerScheduleDTO> {
    await connectDB();
    const nextRunTime = input.enabled
      ? getNextRunTimeFromExpression(input.cronExpression)
      : undefined;
    if (input.enabled && !nextRunTime) {
      throw new Error('Invalid cron expression');
    }
    const doc = await AIRunnerSchedule.create({
      ...input,
      nextRunTime: nextRunTime ? new Date(nextRunTime) : undefined,
    });
    return mapSchedule(doc);
  }

  async updateSchedule(
    id: string,
    input: Partial<Omit<AIRunnerScheduleDTO, '_id' | 'createdAt' | 'updatedAt'>>
  ): Promise<AIRunnerScheduleDTO | null> {
    await connectDB();
    const schedule = await AIRunnerSchedule.findById(id);
    if (!schedule) return null;

    const cronExpression = input.cronExpression ?? schedule.cronExpression;
    const enabled = input.enabled ?? schedule.enabled;
    const nextRunTime = enabled ? getNextRunTimeFromExpression(cronExpression) : undefined;
    if (enabled && !nextRunTime) {
      throw new Error('Invalid cron expression');
    }

    Object.assign(schedule, input, {
      nextRunTime: nextRunTime ? new Date(nextRunTime) : undefined,
    });
    await schedule.save();
    return mapSchedule(schedule);
  }

  async deleteSchedule(id: string): Promise<boolean> {
    await connectDB();
    const result = await AIRunnerSchedule.findByIdAndDelete(id);
    return Boolean(result);
  }

  async toggleSchedule(id: string): Promise<AIRunnerScheduleDTO | null> {
    await connectDB();
    const schedule = await AIRunnerSchedule.findById(id);
    if (!schedule) return null;
    schedule.enabled = !schedule.enabled;
    schedule.nextRunTime =
      schedule.enabled && getNextRunTimeFromExpression(schedule.cronExpression)
        ? new Date(getNextRunTimeFromExpression(schedule.cronExpression)!)
        : undefined;
    await schedule.save();
    return mapSchedule(schedule);
  }

  async listRuns(options?: {
    status?: AIRunnerRunStatus;
    triggeredBy?: AIRunnerTrigger;
    agentProfileId?: string;
    workingDirectory?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ runs: AIRunnerRunDTO[]; total: number }> {
    await connectDB();
    const filter: Record<string, unknown> = {};
    if (options?.status) filter.status = options.status;
    if (options?.triggeredBy) filter.triggeredBy = options.triggeredBy;
    if (options?.agentProfileId) filter.agentProfileId = options.agentProfileId;
    if (options?.workingDirectory) filter.workingDirectory = options.workingDirectory;
    if (options?.search) {
      filter.$or = [
        { promptContent: { $regex: options.search, $options: 'i' } },
        { workingDirectory: { $regex: options.search, $options: 'i' } },
        { command: { $regex: options.search, $options: 'i' } },
      ];
    }

    const limit = Math.min(options?.limit ?? 50, 200);
    const offset = Math.max(options?.offset ?? 0, 0);

    const [runs, total] = await Promise.all([
      AIRunnerRun.find(filter).sort({ startedAt: -1 }).skip(offset).limit(limit),
      AIRunnerRun.countDocuments(filter),
    ]);

    return { runs: runs.map(mapRun), total };
  }

  async getRun(id: string): Promise<AIRunnerRunDTO | null> {
    await connectDB();
    const run = await AIRunnerRun.findById(id);
    return run ? mapRun(run) : null;
  }

  async getActiveRuns(): Promise<AIRunnerRunDTO[]> {
    await connectDB();
    const activeDocs = await AIRunnerRun.find({ status: 'running' }).sort({ startedAt: -1 });
    return activeDocs.map(mapRun);
  }

  async listKnownDirectories(): Promise<AIRunnerDirectoriesResponse> {
    await connectDB();
    const [scheduleDirs, runDirs] = await Promise.all([
      AIRunnerSchedule.distinct('workingDirectory'),
      AIRunnerRun.distinct('workingDirectory'),
    ]);
    const directories = Array.from(
      new Set([
        process.cwd(),
        ...scheduleDirs.filter(Boolean).map(String),
        ...runDirs.filter(Boolean).map(String),
      ])
    ).sort((a, b) => a.localeCompare(b));
    return { directories };
  }

  async killRun(id: string): Promise<boolean> {
    const active = this.activeRuns.get(id);
    if (!active) return false;
    active.killedBy = 'user';

    try {
      process.kill(-active.pid, 'SIGTERM');
    } catch {
      try {
        process.kill(active.pid, 'SIGTERM');
      } catch {
        return false;
      }
    }

    return true;
  }

  async executeRun(request: AIRunnerExecuteRequest): Promise<AIRunnerRunDTO> {
    await connectDB();

    if (this.activeRuns.size >= this.maxConcurrentRuns) {
      throw new Error(`Max concurrent runs reached (${this.maxConcurrentRuns})`);
    }

    const resolved = await this.resolveExecutionRequest(request);
    const runDoc = await AIRunnerRun.create({
      promptId: resolved.promptId,
      scheduleId: resolved.scheduleId,
      agentProfileId: resolved.profile._id,
      promptContent: resolved.promptContent,
      workingDirectory: resolved.workingDirectory,
      command: resolved.command,
      status: 'queued',
      stdout: '',
      stderr: '',
      rawOutput: '',
      startedAt: new Date(),
      triggeredBy: resolved.triggeredBy,
    });

    const child = spawn(resolved.profile.shell, ['-lc', resolved.command], {
      cwd: resolved.workingDirectory,
      env: {
        ...process.env,
        ...resolved.profile.env,
        PROMPT: resolved.promptContent,
        WORKING_DIR: resolved.workingDirectory,
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const runId = stringifyId(runDoc._id);
    const timeoutHandle = setTimeout(() => {
      const active = this.activeRuns.get(runId);
      if (!active) return;
      active.killedBy = 'timeout';
      try {
        process.kill(-active.pid, 'SIGTERM');
      } catch {
        try {
          process.kill(active.pid, 'SIGTERM');
        } catch {
          log.warn(`Failed to terminate timed out run ${runId}`);
        }
      }
    }, resolved.timeoutMinutes * 60_000);

    const usageHandle = setInterval(async () => {
      const active = this.activeRuns.get(runId);
      if (!active) return;
      const usage = await getProcessResourceUsage(active.pid);
      active.peakCpuPercent = Math.max(active.peakCpuPercent, usage.cpuPercent);
      active.peakMemoryBytes = Math.max(active.peakMemoryBytes, usage.memoryBytes);
      active.peakMemoryPercent = Math.max(active.peakMemoryPercent, usage.memoryPercent);
    }, 5000);

    const activeState: ActiveRunState = {
      pid: child.pid ?? 0,
      runId,
      scheduleId: resolved.scheduleId ? stringifyId(resolved.scheduleId) : undefined,
      killedBy: null,
      stdout: '',
      stderr: '',
      rawOutput: '',
      truncatedStdout: false,
      truncatedStderr: false,
      truncatedRaw: false,
      timeoutHandle,
      usageHandle,
      peakCpuPercent: 0,
      peakMemoryBytes: 0,
      peakMemoryPercent: 0,
      startedAt: Date.now(),
    };

    this.activeRuns.set(runId, activeState);

    const applyChunk = (kind: 'stdout' | 'stderr', text: string) => {
      const state = this.activeRuns.get(runId);
      if (!state) return;

      const rawNext = appendOutput(state.rawOutput, text, this.maxOutputChars, state.truncatedRaw);
      state.rawOutput = rawNext.value;
      state.truncatedRaw = rawNext.truncated;

      const cleanText = stripAnsi(text);
      if (kind === 'stdout') {
        const next = appendOutput(
          state.stdout,
          cleanText,
          this.maxOutputChars,
          state.truncatedStdout
        );
        state.stdout = next.value;
        state.truncatedStdout = next.truncated;
      } else {
        const next = appendOutput(
          state.stderr,
          cleanText,
          this.maxOutputChars,
          state.truncatedStderr
        );
        state.stderr = next.value;
        state.truncatedStderr = next.truncated;
      }
    };

    child.stdout?.on('data', (chunk: Buffer | string) => {
      applyChunk('stdout', chunk.toString());
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      applyChunk('stderr', chunk.toString());
    });

    child.on('error', async (error) => {
      log.error('Runner process errored', error);
      await this.finalizeRun(runId, child.pid ?? 0, null, 'failed');
    });

    child.on('close', async (exitCode) => {
      const state = this.activeRuns.get(runId);
      let finalStatus: AIRunnerRunStatus = exitCode === 0 ? 'completed' : 'failed';
      if (state?.killedBy === 'timeout') finalStatus = 'timeout';
      if (state?.killedBy === 'user') finalStatus = 'killed';
      await this.finalizeRun(runId, child.pid ?? 0, exitCode, finalStatus);
    });

    runDoc.status = 'running';
    runDoc.pid = child.pid;
    await runDoc.save();

    if (resolved.scheduleId) {
      const nextRunTime = getNextRunTimeFromExpression(
        resolved.scheduleCronExpression ?? '',
        new Date(Date.now() + 60_000)
      );
      await AIRunnerSchedule.findByIdAndUpdate(resolved.scheduleId, {
        lastRunId: runDoc._id,
        lastRunStatus: 'running',
        lastRunAt: new Date(),
        nextRunTime: nextRunTime ? new Date(nextRunTime) : undefined,
      });
    }

    return mapRun(runDoc);
  }

  private async finalizeRun(
    runId: string,
    pid: number,
    exitCode: number | null,
    status: AIRunnerRunStatus
  ): Promise<void> {
    const active = this.activeRuns.get(runId);
    if (!active) return;
    clearTimeout(active.timeoutHandle);
    clearInterval(active.usageHandle);

    const finishedAt = new Date();
    const durationSeconds = Math.max(0, Math.round((Date.now() - active.startedAt) / 1000));

    const runDoc = await AIRunnerRun.findById(runId);
    if (!runDoc) {
      this.activeRuns.delete(runId);
      return;
    }

    runDoc.pid = pid || runDoc.pid;
    runDoc.status = status;
    runDoc.exitCode = typeof exitCode === 'number' ? exitCode : undefined;
    runDoc.stdout = active.stdout;
    runDoc.stderr = active.stderr;
    runDoc.rawOutput = active.rawOutput;
    runDoc.finishedAt = finishedAt;
    runDoc.durationSeconds = durationSeconds;
    runDoc.resourceUsage = {
      peakCpuPercent: active.peakCpuPercent,
      peakMemoryBytes: active.peakMemoryBytes,
      peakMemoryPercent: active.peakMemoryPercent,
    };
    await runDoc.save();

    if (runDoc.scheduleId) {
      await AIRunnerSchedule.findByIdAndUpdate(runDoc.scheduleId, {
        lastRunId: runDoc._id,
        lastRunStatus: status,
        lastRunAt: finishedAt,
      });
    }

    this.activeRuns.delete(runId);
  }

  private async resolveExecutionRequest(request: AIRunnerExecuteRequest): Promise<{
    promptId?: string;
    scheduleId?: string;
    scheduleCronExpression?: string;
    profile: AIRunnerProfileDTO;
    promptContent: string;
    command: string;
    workingDirectory: string;
    timeoutMinutes: number;
    triggeredBy: AIRunnerTrigger;
  }> {
    await connectDB();

    let scheduleDoc: IAIRunnerSchedule | null = null;
    if (request.scheduleId) {
      scheduleDoc = await AIRunnerSchedule.findById(request.scheduleId);
      if (!scheduleDoc) {
        throw new Error('Schedule not found');
      }
    }

    let promptDoc: IAIRunnerPrompt | null = null;
    const promptId =
      request.promptId ?? (scheduleDoc ? stringifyId(scheduleDoc.promptId) : undefined);
    if (promptId) {
      promptDoc = await AIRunnerPrompt.findById(promptId);
      if (!promptDoc) {
        throw new Error('Saved prompt not found');
      }
    }

    const legacyPromptRuntime =
      (promptDoc as (IAIRunnerPrompt & LegacyPromptRuntime) | null) ?? null;
    const profileId =
      request.agentProfileId ??
      (scheduleDoc?.agentProfileId ? stringifyId(scheduleDoc.agentProfileId) : undefined) ??
      (legacyPromptRuntime?.agentProfileId
        ? stringifyId(legacyPromptRuntime.agentProfileId)
        : undefined);
    if (!profileId) {
      throw new Error('Agent profile is required');
    }

    const profileDoc = await AIRunnerProfile.findById(profileId);
    if (!profileDoc || !profileDoc.enabled) {
      throw new Error('Agent profile is not available');
    }

    const profile = mapProfile(profileDoc);
    const workingDirectory =
      request.workingDirectory ??
      scheduleDoc?.workingDirectory ??
      legacyPromptRuntime?.workingDirectory;
    if (!workingDirectory) {
      throw new Error('Working directory is required');
    }
    await ensureDirectoryExists(workingDirectory);

    const promptType = request.type ?? promptDoc?.type;
    const promptSource = request.content ?? promptDoc?.content;
    if (!promptType || !promptSource) {
      throw new Error('Prompt content is required');
    }

    const promptContent = await resolvePromptContent(promptType, promptSource);
    const timeoutMinutes = Math.min(
      Math.max(
        request.timeout ??
          scheduleDoc?.timeout ??
          legacyPromptRuntime?.timeout ??
          profile.defaultTimeout,
        1
      ),
      profile.maxTimeout
    );
    const command = resolveInvocationTemplate(
      profile.invocationTemplate,
      promptContent,
      workingDirectory
    );

    return {
      promptId: promptDoc ? stringifyId(promptDoc._id) : undefined,
      scheduleId: scheduleDoc ? stringifyId(scheduleDoc._id) : undefined,
      scheduleCronExpression: scheduleDoc?.cronExpression,
      profile,
      promptContent,
      command,
      workingDirectory,
      timeoutMinutes,
      triggeredBy: request.triggeredBy ?? (scheduleDoc ? 'schedule' : 'manual'),
    };
  }

  private async tickScheduler(): Promise<void> {
    if (this.schedulerBusy) return;
    this.schedulerBusy = true;

    try {
      await connectDB();
      const now = new Date();
      const dueSchedules = await AIRunnerSchedule.find({
        enabled: true,
        nextRunTime: { $lte: now },
      }).sort({ nextRunTime: 1 });

      for (const schedule of dueSchedules) {
        const scheduleId = stringifyId(schedule._id);
        const overlappingRun = Array.from(this.activeRuns.values()).some(
          (run) => run.scheduleId === scheduleId
        );
        if (overlappingRun) {
          const nextRunTime = getNextRunTimeFromExpression(
            schedule.cronExpression,
            new Date(now.getTime() + 60_000)
          );
          await AIRunnerSchedule.findByIdAndUpdate(scheduleId, {
            nextRunTime: nextRunTime ? new Date(nextRunTime) : undefined,
          });
          continue;
        }

        try {
          await this.executeRun({
            promptId: stringifyId(schedule.promptId),
            scheduleId,
            triggeredBy: 'schedule',
          });
        } catch (error) {
          log.error(`Failed to execute scheduled run ${scheduleId}`, error);
          const nextRunTime = getNextRunTimeFromExpression(
            schedule.cronExpression,
            new Date(now.getTime() + 60_000)
          );
          await AIRunnerSchedule.findByIdAndUpdate(scheduleId, {
            lastRunStatus: 'failed',
            lastRunAt: new Date(),
            nextRunTime: nextRunTime ? new Date(nextRunTime) : undefined,
          });
        }
      }
    } finally {
      this.schedulerBusy = false;
    }
  }
}

let runnerService: AIRunnerService | null = null;

export function getAIRunnerService(): AIRunnerService {
  if (!runnerService) {
    runnerService = new AIRunnerService();
  }
  return runnerService;
}
