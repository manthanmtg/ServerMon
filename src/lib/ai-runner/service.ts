import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import AIRunnerAutoflow from '@/models/AIRunnerAutoflow';
import AIRunnerJob from '@/models/AIRunnerJob';
import AIRunnerProfile from '@/models/AIRunnerProfile';
import AIRunnerPrompt from '@/models/AIRunnerPrompt';
import AIRunnerPromptTemplate from '@/models/AIRunnerPromptTemplate';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule from '@/models/AIRunnerSchedule';
import AIRunnerWorkspace from '@/models/AIRunnerWorkspace';
import type {
  AIRunnerAutoflowDTO,
  AIRunnerDirectoriesResponse,
  AIRunnerExecuteRequest,
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerPromptTemplateDTO,
  AIRunnerRunDTO,
  AIRunnerRunStatus,
  AIRunnerScheduleDTO,
  AIRunnerSettingsDTO,
  AIRunnerTemplateValidationResult,
  AIRunnerTrigger,
  AIRunnerWorkspaceDTO,
} from '@/modules/ai-runner/types';
import { ensureAIRunnerSupervisor } from './processes';
import { terminateAIRunnerExecution } from './execution';
import { enqueueRunRequest } from './queue';
import { getAIRunnerSettings, updateAIRunnerSettings } from './settings';
import {
  ensureDirectoryExists,
  getNextRunTimeFromExpression,
  mapAutoflow,
  mapProfile,
  mapPrompt,
  mapPromptTemplate,
  mapRun,
  mapSchedule,
  mapWorkspace,
  resolveInvocationTemplate,
  shellEscape,
  stripAnsi,
  stringifyId,
  validateProfileTemplate,
} from './shared';

const execFileAsync = promisify(execFile);
const RUN_LIST_PROJECTION = {
  stdout: 0,
  stderr: 0,
  rawOutput: 0,
} as const;

type AIRunnerAutoflowInputItem = {
  name: string;
  promptId?: string;
  promptContent?: string;
  promptType: 'inline' | 'file-reference';
  agentProfileId: string;
  workspaceId?: string;
  workingDirectory: string;
  timeout: number;
};

type AIRunnerAutoflowCreateInput = {
  name: string;
  description?: string;
  mode?: 'sequential' | 'parallel';
  continueOnFailure: boolean;
  items: AIRunnerAutoflowInputItem[];
  startImmediately?: boolean;
};

function toOptionalObjectId(value?: string): mongoose.Types.ObjectId | undefined {
  return value ? new mongoose.Types.ObjectId(value) : undefined;
}

function normalizeAutoflowItems(input: AIRunnerAutoflowInputItem[]) {
  return input.map((item) => ({
    ...item,
    promptId: toOptionalObjectId(item.promptId),
    agentProfileId: new mongoose.Types.ObjectId(item.agentProfileId),
    workspaceId: toOptionalObjectId(item.workspaceId),
    status: 'pending' as const,
  }));
}

export interface AIRunnerServiceOptions {
  autoStartSupervisor?: boolean;
}

export class AIRunnerService {
  constructor(options: AIRunnerServiceOptions = {}) {
    if (options.autoStartSupervisor !== false) {
      ensureAIRunnerSupervisor();
    }
  }

  async validateProfileTemplate(input: {
    invocationTemplate: string;
    shell: string;
  }): Promise<AIRunnerTemplateValidationResult> {
    return validateProfileTemplate({
      ...input,
      execFileAsync,
    });
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

    const validation = await this.validateProfileTemplate({
      invocationTemplate: input.invocationTemplate ?? existing.invocationTemplate,
      shell: input.shell ?? existing.shell,
    });
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

  async listPromptTemplates(): Promise<AIRunnerPromptTemplateDTO[]> {
    await connectDB();
    const docs = await AIRunnerPromptTemplate.find().sort({ updatedAt: -1 });
    return docs.map(mapPromptTemplate);
  }

  async createPromptTemplate(
    input: Omit<AIRunnerPromptTemplateDTO, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<AIRunnerPromptTemplateDTO> {
    await connectDB();
    const doc = await AIRunnerPromptTemplate.create(input);
    return mapPromptTemplate(doc);
  }

  async updatePromptTemplate(
    id: string,
    input: Partial<Omit<AIRunnerPromptTemplateDTO, '_id' | 'createdAt' | 'updatedAt'>>
  ): Promise<AIRunnerPromptTemplateDTO | null> {
    await connectDB();
    const doc = await AIRunnerPromptTemplate.findByIdAndUpdate(id, input, { new: true });
    return doc ? mapPromptTemplate(doc) : null;
  }

  async deletePromptTemplate(id: string): Promise<boolean> {
    await connectDB();
    const result = await AIRunnerPromptTemplate.findByIdAndDelete(id);
    return Boolean(result);
  }

  async listWorkspaces(): Promise<AIRunnerWorkspaceDTO[]> {
    await connectDB();
    const docs = await AIRunnerWorkspace.find().sort({ enabled: -1, updatedAt: -1 });
    return docs.map(mapWorkspace);
  }

  async createWorkspace(
    input: Omit<AIRunnerWorkspaceDTO, '_id' | 'createdAt' | 'updatedAt'>
  ): Promise<AIRunnerWorkspaceDTO> {
    await ensureDirectoryExists(input.path);
    await connectDB();
    const doc = await AIRunnerWorkspace.create(input);
    return mapWorkspace(doc);
  }

  async updateWorkspace(
    id: string,
    input: Partial<Omit<AIRunnerWorkspaceDTO, '_id' | 'createdAt' | 'updatedAt'>>
  ): Promise<AIRunnerWorkspaceDTO | null> {
    if (input.path) {
      await ensureDirectoryExists(input.path);
    }
    await connectDB();
    const doc = await AIRunnerWorkspace.findByIdAndUpdate(id, input, { new: true });
    return doc ? mapWorkspace(doc) : null;
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    await connectDB();
    const [scheduleCount, activeRunCount] = await Promise.all([
      AIRunnerSchedule.countDocuments({ workspaceId: id }),
      AIRunnerRun.countDocuments({
        workspaceId: id,
        status: { $in: ['queued', 'running', 'retrying'] },
      }),
    ]);
    if (scheduleCount > 0 || activeRunCount > 0) {
      throw new Error('Cannot delete a workspace that is still referenced by schedules or runs');
    }
    const result = await AIRunnerWorkspace.findByIdAndDelete(id);
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
    const scheduleInput = { ...input };
    if (scheduleInput.workspaceId) {
      const workspace = await AIRunnerWorkspace.findById(scheduleInput.workspaceId);
      if (!workspace || !workspace.enabled) {
        throw new Error('Workspace is not available');
      }
      scheduleInput.workingDirectory = workspace.path;
    }
    const nextRunTime = input.enabled
      ? getNextRunTimeFromExpression(scheduleInput.cronExpression)
      : undefined;
    if (scheduleInput.enabled && !nextRunTime) {
      throw new Error('Invalid cron expression');
    }
    const doc = await AIRunnerSchedule.create({
      ...scheduleInput,
      nextRunTime: nextRunTime ? new Date(nextRunTime) : undefined,
    });
    ensureAIRunnerSupervisor();
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
    const updateInput = { ...input };
    if (updateInput.workspaceId) {
      const workspace = await AIRunnerWorkspace.findById(updateInput.workspaceId);
      if (!workspace || !workspace.enabled) {
        throw new Error('Workspace is not available');
      }
      updateInput.workingDirectory = workspace.path;
    }
    const nextRunTime = enabled ? getNextRunTimeFromExpression(cronExpression) : undefined;
    if (enabled && !nextRunTime) {
      throw new Error('Invalid cron expression');
    }

    Object.assign(schedule, updateInput, {
      nextRunTime: nextRunTime ? new Date(nextRunTime) : undefined,
    });
    await schedule.save();
    ensureAIRunnerSupervisor();
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
    ensureAIRunnerSupervisor();
    return mapSchedule(schedule);
  }

  async getSettings(): Promise<AIRunnerSettingsDTO> {
    return getAIRunnerSettings();
  }

  async updateSettings(input: {
    schedulesGloballyEnabled?: boolean;
    autoflowMode?: 'sequential' | 'parallel';
  }): Promise<AIRunnerSettingsDTO> {
    const settings = await updateAIRunnerSettings(input);
    ensureAIRunnerSupervisor();
    return settings;
  }

  async listAutoflows(): Promise<AIRunnerAutoflowDTO[]> {
    await connectDB();
    const docs = await AIRunnerAutoflow.find().sort({ updatedAt: -1 }).limit(100);
    return docs.map(mapAutoflow);
  }

  async createAutoflow(input: AIRunnerAutoflowCreateInput): Promise<AIRunnerAutoflowDTO> {
    await connectDB();
    const settings = await getAIRunnerSettings();
    const doc = await AIRunnerAutoflow.create({
      ...input,
      mode: input.mode ?? settings.autoflowMode,
      status: input.startImmediately === false ? 'draft' : 'running',
      startedAt: input.startImmediately === false ? undefined : new Date(),
      currentIndex: 0,
      items: normalizeAutoflowItems(input.items),
    });
    ensureAIRunnerSupervisor();
    return mapAutoflow(doc);
  }

  async updateAutoflow(
    id: string,
    input: Partial<Omit<AIRunnerAutoflowCreateInput, 'startImmediately'>>
  ): Promise<AIRunnerAutoflowDTO | null> {
    await connectDB();
    const existing = await AIRunnerAutoflow.findById(id);
    if (!existing) return null;
    if (existing.status === 'running') {
      throw new Error('Cannot edit an autoflow while it is running');
    }
    Object.assign(existing, input);
    if (input.items) {
      existing.items = normalizeAutoflowItems(input.items);
    }
    await existing.save();
    return mapAutoflow(existing);
  }

  async startAutoflow(id: string): Promise<AIRunnerAutoflowDTO | null> {
    await connectDB();
    const doc = await AIRunnerAutoflow.findById(id);
    if (!doc) return null;
    doc.status = 'running';
    doc.startedAt = new Date();
    doc.finishedAt = undefined;
    doc.currentIndex = 0;
    doc.items = doc.items.map((item) => ({
      ...item,
      status: 'pending',
      runId: undefined,
      lastError: undefined,
      startedAt: undefined,
      finishedAt: undefined,
    }));
    await doc.save();
    ensureAIRunnerSupervisor();
    return mapAutoflow(doc);
  }

  async cancelAutoflow(id: string): Promise<AIRunnerAutoflowDTO | null> {
    await connectDB();
    const doc = await AIRunnerAutoflow.findById(id);
    if (!doc) return null;
    doc.status = 'canceled';
    doc.finishedAt = new Date();
    doc.items = doc.items.map((item) =>
      item.status === 'pending' || item.status === 'queued'
        ? { ...item, status: 'canceled', finishedAt: new Date() }
        : item
    );
    await doc.save();
    return mapAutoflow(doc);
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
      AIRunnerRun.find(filter)
        .select(RUN_LIST_PROJECTION)
        .sort({ queuedAt: -1, startedAt: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
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
    const activeDocs = await AIRunnerRun.find({
      status: { $in: ['queued', 'running', 'retrying'] },
    })
      .select(RUN_LIST_PROJECTION)
      .sort({ queuedAt: -1, startedAt: -1, createdAt: -1 })
      .lean();
    return activeDocs.map(mapRun);
  }

  async listKnownDirectories(): Promise<AIRunnerDirectoriesResponse> {
    await connectDB();
    const [workspaceDirs, scheduleDirs, runDirs] = await Promise.all([
      AIRunnerWorkspace.distinct('path', { enabled: true }),
      AIRunnerSchedule.distinct('workingDirectory'),
      AIRunnerRun.distinct('workingDirectory'),
    ]);
    const directories = Array.from(
      new Set([
        process.cwd(),
        ...workspaceDirs.filter(Boolean).map(String),
        ...scheduleDirs.filter(Boolean).map(String),
        ...runDirs.filter(Boolean).map(String),
      ])
    ).sort((a, b) => a.localeCompare(b));
    return { directories };
  }

  async killRun(id: string): Promise<boolean> {
    await connectDB();
    const run = await AIRunnerRun.findById(id);
    if (!run) return false;

    if (['completed', 'failed', 'timeout', 'killed'].includes(run.status)) {
      return false;
    }

    const job =
      (run.jobId ? await AIRunnerJob.findById(run.jobId) : null) ??
      (await AIRunnerJob.findOne({ runId: run._id }));
    const now = new Date();

    if (!job) {
      run.status = 'killed';
      run.finishedAt = now;
      run.lastError = 'Run was canceled without an active job record';
      await run.save();
      return true;
    }

    if (job.status === 'queued' || job.status === 'retrying') {
      await Promise.all([
        AIRunnerJob.findByIdAndUpdate(job._id, {
          $set: {
            status: 'canceled',
            cancelRequestedAt: now,
            finishedAt: now,
            lastError: 'Run was canceled before execution started',
          },
        }),
        AIRunnerRun.findByIdAndUpdate(run._id, {
          $set: {
            status: 'killed',
            jobStatus: 'canceled',
            finishedAt: now,
            lastError: 'Run was canceled before execution started',
          },
        }),
      ]);
    } else {
      await Promise.all([
        AIRunnerJob.findByIdAndUpdate(job._id, {
          $set: {
            cancelRequestedAt: now,
            lastError: 'Run cancellation requested',
          },
        }),
        AIRunnerRun.findByIdAndUpdate(run._id, {
          $set: {
            lastError: 'Run cancellation requested',
          },
        }),
      ]);
    }

    const pid = typeof job.childPid === 'number' ? job.childPid : run.pid;
    terminateAIRunnerExecution({
      pid: typeof pid === 'number' && pid > 0 ? pid : undefined,
      unitName: job.executionUnit,
    });

    return true;
  }

  async executeRun(request: AIRunnerExecuteRequest): Promise<AIRunnerRunDTO> {
    const run = await enqueueRunRequest(request);
    ensureAIRunnerSupervisor();
    return run;
  }
}

let runnerService: AIRunnerService | null = null;

export function getAIRunnerService(): AIRunnerService {
  if (!runnerService) {
    runnerService = new AIRunnerService();
  }
  return runnerService;
}

export { getNextRunTimeFromExpression, resolveInvocationTemplate, shellEscape, stripAnsi };
