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
  AIRunnerImportDecision,
  AIRunnerImportPreviewDTO,
  AIRunnerImportResultDTO,
  AIRunnerPortableBundle,
  AIRunnerPortableResource,
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
import { decodeStoredPromptAttachments, normalizeAttachmentRefs } from './attachments';

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
  attachments?: AIRunnerExecuteRequest['attachments'];
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

const PORTABLE_RESOURCES: AIRunnerPortableResource[] = [
  'settings',
  'profiles',
  'workspaces',
  'prompts',
  'promptTemplates',
  'schedules',
];

function toOptionalObjectId(value?: string): mongoose.Types.ObjectId | undefined {
  return value ? new mongoose.Types.ObjectId(value) : undefined;
}

function normalizeAutoflowItems(input: AIRunnerAutoflowInputItem[]) {
  return input.map((item) => ({
    ...item,
    attachments: normalizeAttachmentRefs(item.attachments),
    promptId: toOptionalObjectId(item.promptId),
    agentProfileId: new mongoose.Types.ObjectId(item.agentProfileId),
    workspaceId: toOptionalObjectId(item.workspaceId),
    status: 'pending' as const,
  }));
}

function emptyPortableResourceCounts(): Record<
  AIRunnerPortableResource,
  { incoming: number; conflicts: number }
> {
  return Object.fromEntries(
    PORTABLE_RESOURCES.map((resource) => [resource, { incoming: 0, conflicts: 0 }])
  ) as Record<AIRunnerPortableResource, { incoming: number; conflicts: number }>;
}

function emptyImportMutationCounts(): Record<
  AIRunnerPortableResource,
  { created: number; updated: number; skipped: number }
> {
  return Object.fromEntries(
    PORTABLE_RESOURCES.map((resource) => [resource, { created: 0, updated: 0, skipped: 0 }])
  ) as Record<AIRunnerPortableResource, { created: number; updated: number; skipped: number }>;
}

function decisionKey(resource: AIRunnerPortableResource, key: string): string {
  return `${resource}:${key}`;
}

function shouldOverwriteConflict(
  decisions: AIRunnerImportDecision[],
  resource: AIRunnerPortableResource,
  key: string
): boolean {
  return decisions.some(
    (decision) => decision.resource === resource && decision.key === key && decision.overwrite
  );
}

interface DeleteLinkedResourceOptions {
  force?: boolean;
}

type ScheduleReferenceInput = {
  promptId?: string;
  agentProfileId?: string;
  workspaceId?: string;
};

const PAUSE_LINKED_SCHEDULES_UPDATE = {
  $set: { enabled: false },
  $unset: { nextRunTime: '' },
} as const;

async function pauseLinkedSchedules(filter: Record<string, string>): Promise<void> {
  await AIRunnerSchedule.updateMany(filter, PAUSE_LINKED_SCHEDULES_UPDATE);
}

async function resolveScheduleReferenceUpdates(
  input: ScheduleReferenceInput
): Promise<{ workingDirectory?: string }> {
  if (!input.promptId) {
    throw new Error('Prompt is not available');
  }
  const prompt = await AIRunnerPrompt.findById(input.promptId);
  if (!prompt) {
    throw new Error('Prompt is not available');
  }

  if (!input.agentProfileId) {
    throw new Error('Profile is not available');
  }
  const profile = await AIRunnerProfile.findById(input.agentProfileId);
  if (!profile || !profile.enabled) {
    throw new Error('Profile is not available');
  }

  if (!input.workspaceId) {
    return {};
  }

  const workspace = await AIRunnerWorkspace.findById(input.workspaceId);
  if (!workspace || !workspace.enabled) {
    throw new Error('Workspace is not available');
  }

  return { workingDirectory: workspace.path };
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

  async deleteProfile(id: string, options: DeleteLinkedResourceOptions = {}): Promise<boolean> {
    await connectDB();
    const inUseCount = await AIRunnerSchedule.countDocuments({ agentProfileId: id });
    if (inUseCount > 0) {
      if (!options.force) {
        throw new Error('Cannot delete a profile that is still referenced by schedules');
      }
      await pauseLinkedSchedules({ agentProfileId: id });
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
    const doc = await AIRunnerPrompt.create({
      ...input,
      attachments: decodeStoredPromptAttachments(input.attachments),
    });
    return mapPrompt(doc);
  }

  async updatePrompt(
    id: string,
    input: Partial<Omit<AIRunnerPromptDTO, '_id' | 'createdAt' | 'updatedAt'>>
  ): Promise<AIRunnerPromptDTO | null> {
    await connectDB();
    const doc = await AIRunnerPrompt.findByIdAndUpdate(
      id,
      input.attachments
        ? { ...input, attachments: decodeStoredPromptAttachments(input.attachments) }
        : input,
      { new: true }
    );
    return doc ? mapPrompt(doc) : null;
  }

  async deletePrompt(id: string, options: DeleteLinkedResourceOptions = {}): Promise<boolean> {
    await connectDB();
    const scheduleCount = await AIRunnerSchedule.countDocuments({ promptId: id });
    if (scheduleCount > 0) {
      if (!options.force) {
        throw new Error('Cannot delete a prompt that is still referenced by schedules');
      }
      await pauseLinkedSchedules({ promptId: id });
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

  async deleteWorkspace(id: string, options: DeleteLinkedResourceOptions = {}): Promise<boolean> {
    await connectDB();
    const [scheduleCount, activeRunCount] = await Promise.all([
      AIRunnerSchedule.countDocuments({ workspaceId: id }),
      AIRunnerRun.countDocuments({
        workspaceId: id,
        status: { $in: ['queued', 'running', 'retrying'] },
      }),
    ]);
    if (activeRunCount > 0) {
      throw new Error('Cannot delete a workspace while it has active runs');
    }
    if (scheduleCount > 0) {
      if (!options.force) {
        throw new Error('Cannot delete a workspace that is still referenced by schedules');
      }
      await pauseLinkedSchedules({ workspaceId: id });
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
    const referenceUpdates = await resolveScheduleReferenceUpdates({
      promptId: scheduleInput.promptId,
      agentProfileId: scheduleInput.agentProfileId,
      workspaceId: scheduleInput.workspaceId,
    });
    if (referenceUpdates.workingDirectory) {
      scheduleInput.workingDirectory = referenceUpdates.workingDirectory;
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
    const shouldValidateReferences =
      enabled ||
      Boolean(input.promptId) ||
      Boolean(input.agentProfileId) ||
      Boolean(input.workspaceId);
    if (shouldValidateReferences) {
      const referenceUpdates = await resolveScheduleReferenceUpdates({
        promptId: input.promptId ?? stringifyId(schedule.promptId),
        agentProfileId: input.agentProfileId ?? stringifyId(schedule.agentProfileId),
        workspaceId: input.workspaceId ?? stringifyId(schedule.workspaceId),
      });
      if (referenceUpdates.workingDirectory) {
        updateInput.workingDirectory = referenceUpdates.workingDirectory;
      }
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
    const enabled = !schedule.enabled;
    if (enabled) {
      await resolveScheduleReferenceUpdates({
        promptId: stringifyId(schedule.promptId),
        agentProfileId: stringifyId(schedule.agentProfileId),
        workspaceId: stringifyId(schedule.workspaceId),
      });
    }
    schedule.enabled = enabled;
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

  async exportBundle(resources: AIRunnerPortableResource[]): Promise<AIRunnerPortableBundle> {
    await connectDB();
    const selected = new Set(resources);
    const bundle: AIRunnerPortableBundle = {
      kind: 'servermon.ai-runner.bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      resources: {},
    };

    if (selected.has('settings')) {
      const settings = await getAIRunnerSettings();
      bundle.resources.settings = {
        schedulesGloballyEnabled: settings.schedulesGloballyEnabled,
        autoflowMode: settings.autoflowMode,
      };
    }

    if (selected.has('profiles')) {
      const profiles = await this.listProfiles();
      bundle.resources.profiles = profiles.map(
        ({
          name,
          slug,
          agentType,
          invocationTemplate,
          defaultTimeout,
          maxTimeout,
          shell,
          requiresTTY,
          env,
          enabled,
          icon,
        }) => ({
          name,
          slug,
          agentType,
          invocationTemplate,
          defaultTimeout,
          maxTimeout,
          shell,
          requiresTTY,
          env,
          enabled,
          icon,
        })
      );
    }

    if (selected.has('workspaces')) {
      const workspaces = await this.listWorkspaces();
      bundle.resources.workspaces = workspaces.map(({ name, path, blocking, enabled, notes }) => ({
        name,
        path,
        blocking,
        enabled,
        notes,
      }));
    }

    if (selected.has('prompts')) {
      const prompts = await this.listPrompts();
      bundle.resources.prompts = prompts.map(({ name, content, type, tags, attachments }) => ({
        name,
        content,
        type,
        tags,
        attachments,
      }));
    }

    if (selected.has('promptTemplates')) {
      const templates = await this.listPromptTemplates();
      bundle.resources.promptTemplates = templates.map(({ name, content, description, tags }) => ({
        name,
        content,
        description,
        tags,
      }));
    }

    if (selected.has('schedules')) {
      const [schedules, prompts, profiles, workspaces] = await Promise.all([
        this.listSchedules(),
        this.listPrompts(),
        this.listProfiles(),
        this.listWorkspaces(),
      ]);
      const promptById = new Map(prompts.map((prompt) => [prompt._id, prompt]));
      const profileById = new Map(profiles.map((profile) => [profile._id, profile]));
      const workspaceById = new Map(workspaces.map((workspace) => [workspace._id, workspace]));
      bundle.resources.schedules = schedules.map((schedule) => ({
        name: schedule.name,
        promptName: promptById.get(schedule.promptId)?.name ?? schedule.promptId,
        agentProfileSlug: profileById.get(schedule.agentProfileId)?.slug ?? schedule.agentProfileId,
        workspacePath: schedule.workspaceId
          ? workspaceById.get(schedule.workspaceId)?.path
          : undefined,
        workingDirectory: schedule.workingDirectory,
        timeout: schedule.timeout,
        retries: schedule.retries,
        cronExpression: schedule.cronExpression,
        enabled: schedule.enabled,
      }));
    }

    return bundle;
  }

  async previewImportBundle(
    bundle: AIRunnerPortableBundle,
    selectedResources: AIRunnerPortableResource[]
  ): Promise<AIRunnerImportPreviewDTO> {
    await connectDB();
    const selected = new Set(selectedResources);
    const resources = emptyPortableResourceCounts();
    const conflicts: AIRunnerImportPreviewDTO['conflicts'] = [];
    const missingReferences: string[] = [];

    const [profiles, workspaces, prompts, templates, schedules] = await Promise.all([
      this.listProfiles(),
      this.listWorkspaces(),
      this.listPrompts(),
      this.listPromptTemplates(),
      this.listSchedules(),
    ]);

    const profileBySlug = new Map(profiles.map((profile) => [profile.slug, profile]));
    const workspaceByPath = new Map(workspaces.map((workspace) => [workspace.path, workspace]));
    const promptByName = new Map(prompts.map((prompt) => [prompt.name, prompt]));
    const templateByName = new Map(templates.map((template) => [template.name, template]));
    const scheduleByName = new Map(schedules.map((schedule) => [schedule.name, schedule]));

    const addConflict = (
      resource: AIRunnerPortableResource,
      key: string,
      label: string,
      existingId: string | undefined,
      incomingSummary: string
    ) => {
      resources[resource].conflicts += 1;
      conflicts.push({ resource, key, label, existingId, incomingSummary });
    };

    if (selected.has('settings') && bundle.resources.settings) {
      resources.settings.incoming = 1;
      resources.settings.conflicts = 1;
      conflicts.push({
        resource: 'settings',
        key: 'settings',
        label: 'AI Runner settings',
        incomingSummary: `Schedules ${bundle.resources.settings.schedulesGloballyEnabled ? 'enabled' : 'paused'}, AutoFlow ${bundle.resources.settings.autoflowMode}`,
      });
    }

    if (selected.has('profiles')) {
      for (const profile of bundle.resources.profiles ?? []) {
        resources.profiles.incoming += 1;
        const existing = profileBySlug.get(profile.slug);
        if (existing) {
          addConflict('profiles', profile.slug, profile.name, existing._id, profile.agentType);
        }
      }
    }

    if (selected.has('workspaces')) {
      for (const workspace of bundle.resources.workspaces ?? []) {
        resources.workspaces.incoming += 1;
        const existing = workspaceByPath.get(workspace.path);
        if (existing) {
          addConflict(
            'workspaces',
            workspace.path,
            workspace.name,
            existing._id,
            workspace.blocking ? 'blocking' : 'parallel allowed'
          );
        }
      }
    }

    if (selected.has('prompts')) {
      for (const prompt of bundle.resources.prompts ?? []) {
        resources.prompts.incoming += 1;
        const existing = promptByName.get(prompt.name);
        if (existing) {
          addConflict('prompts', prompt.name, prompt.name, existing._id, prompt.type);
        }
      }
    }

    if (selected.has('promptTemplates')) {
      for (const template of bundle.resources.promptTemplates ?? []) {
        resources.promptTemplates.incoming += 1;
        const existing = templateByName.get(template.name);
        if (existing) {
          addConflict(
            'promptTemplates',
            template.name,
            template.name,
            existing._id,
            `${template.content.length} chars`
          );
        }
      }
    }

    if (selected.has('schedules')) {
      const importedProfileSlugs = new Set(
        selected.has('profiles')
          ? (bundle.resources.profiles ?? []).map((profile) => profile.slug)
          : []
      );
      const importedPromptNames = new Set(
        selected.has('prompts') ? (bundle.resources.prompts ?? []).map((prompt) => prompt.name) : []
      );
      const importedWorkspacePaths = new Set(
        selected.has('workspaces')
          ? (bundle.resources.workspaces ?? []).map((workspace) => workspace.path)
          : []
      );

      for (const schedule of bundle.resources.schedules ?? []) {
        resources.schedules.incoming += 1;
        const existing = scheduleByName.get(schedule.name);
        if (existing) {
          addConflict(
            'schedules',
            schedule.name,
            schedule.name,
            existing._id,
            schedule.cronExpression
          );
        }
        if (
          !promptByName.has(schedule.promptName) &&
          !importedPromptNames.has(schedule.promptName)
        ) {
          missingReferences.push(
            `Schedule "${schedule.name}" references missing prompt "${schedule.promptName}"`
          );
        }
        if (
          !profileBySlug.has(schedule.agentProfileSlug) &&
          !importedProfileSlugs.has(schedule.agentProfileSlug)
        ) {
          missingReferences.push(
            `Schedule "${schedule.name}" references missing profile "${schedule.agentProfileSlug}"`
          );
        }
        if (
          schedule.workspacePath &&
          !workspaceByPath.has(schedule.workspacePath) &&
          !importedWorkspacePaths.has(schedule.workspacePath)
        ) {
          missingReferences.push(
            `Schedule "${schedule.name}" references missing workspace "${schedule.workspacePath}"`
          );
        }
      }
    }

    return {
      valid: missingReferences.length === 0,
      resources,
      conflicts,
      missingReferences,
    };
  }

  async importBundle(input: {
    bundle: AIRunnerPortableBundle;
    selectedResources: AIRunnerPortableResource[];
    decisions: AIRunnerImportDecision[];
  }): Promise<AIRunnerImportResultDTO> {
    await connectDB();
    const preview = await this.previewImportBundle(input.bundle, input.selectedResources);
    if (!preview.valid) {
      return { ...preview, imported: emptyImportMutationCounts() };
    }

    const selected = new Set(input.selectedResources);
    const imported = emptyImportMutationCounts();
    const skippedConflicts = new Set(
      preview.conflicts
        .filter(
          (conflict) => !shouldOverwriteConflict(input.decisions, conflict.resource, conflict.key)
        )
        .map((conflict) => decisionKey(conflict.resource, conflict.key))
    );

    if (selected.has('settings') && input.bundle.resources.settings) {
      if (skippedConflicts.has(decisionKey('settings', 'settings'))) {
        imported.settings.skipped += 1;
      } else {
        await updateAIRunnerSettings(input.bundle.resources.settings);
        imported.settings.updated += 1;
      }
    }

    if (selected.has('profiles')) {
      for (const profile of input.bundle.resources.profiles ?? []) {
        const existing = await AIRunnerProfile.findOne({ slug: profile.slug });
        if (existing) {
          if (skippedConflicts.has(decisionKey('profiles', profile.slug))) {
            imported.profiles.skipped += 1;
            continue;
          }
          Object.assign(existing, profile);
          await existing.save();
          imported.profiles.updated += 1;
        } else {
          await AIRunnerProfile.create(profile);
          imported.profiles.created += 1;
        }
      }
    }

    if (selected.has('workspaces')) {
      for (const workspace of input.bundle.resources.workspaces ?? []) {
        const existing = await AIRunnerWorkspace.findOne({ path: workspace.path });
        if (existing) {
          if (skippedConflicts.has(decisionKey('workspaces', workspace.path))) {
            imported.workspaces.skipped += 1;
            continue;
          }
          Object.assign(existing, workspace);
          await existing.save();
          imported.workspaces.updated += 1;
        } else {
          await AIRunnerWorkspace.create(workspace);
          imported.workspaces.created += 1;
        }
      }
    }

    if (selected.has('prompts')) {
      for (const prompt of input.bundle.resources.prompts ?? []) {
        const existing = await AIRunnerPrompt.findOne({ name: prompt.name });
        if (existing) {
          if (skippedConflicts.has(decisionKey('prompts', prompt.name))) {
            imported.prompts.skipped += 1;
            continue;
          }
          Object.assign(existing, {
            ...prompt,
            attachments: decodeStoredPromptAttachments(prompt.attachments),
          });
          await existing.save();
          imported.prompts.updated += 1;
        } else {
          await AIRunnerPrompt.create({
            ...prompt,
            attachments: decodeStoredPromptAttachments(prompt.attachments),
          });
          imported.prompts.created += 1;
        }
      }
    }

    if (selected.has('promptTemplates')) {
      for (const template of input.bundle.resources.promptTemplates ?? []) {
        const existing = await AIRunnerPromptTemplate.findOne({ name: template.name });
        if (existing) {
          if (skippedConflicts.has(decisionKey('promptTemplates', template.name))) {
            imported.promptTemplates.skipped += 1;
            continue;
          }
          Object.assign(existing, template);
          await existing.save();
          imported.promptTemplates.updated += 1;
        } else {
          await AIRunnerPromptTemplate.create(template);
          imported.promptTemplates.created += 1;
        }
      }
    }

    if (selected.has('schedules')) {
      const [prompts, profiles, workspaces] = await Promise.all([
        this.listPrompts(),
        this.listProfiles(),
        this.listWorkspaces(),
      ]);
      const promptByName = new Map(prompts.map((prompt) => [prompt.name, prompt]));
      const profileBySlug = new Map(profiles.map((profile) => [profile.slug, profile]));
      const workspaceByPath = new Map(workspaces.map((workspace) => [workspace.path, workspace]));

      for (const schedule of input.bundle.resources.schedules ?? []) {
        const prompt = promptByName.get(schedule.promptName);
        const profile = profileBySlug.get(schedule.agentProfileSlug);
        const workspace = schedule.workspacePath
          ? workspaceByPath.get(schedule.workspacePath)
          : undefined;
        if (!prompt || !profile || (schedule.workspacePath && !workspace)) {
          imported.schedules.skipped += 1;
          continue;
        }

        const scheduleInput = {
          name: schedule.name,
          promptId: prompt._id,
          agentProfileId: profile._id,
          workspaceId: workspace?._id,
          workingDirectory: workspace?.path ?? schedule.workingDirectory,
          timeout: schedule.timeout,
          retries: schedule.retries,
          cronExpression: schedule.cronExpression,
          enabled: schedule.enabled,
          nextRunTime:
            schedule.enabled && getNextRunTimeFromExpression(schedule.cronExpression)
              ? new Date(getNextRunTimeFromExpression(schedule.cronExpression)!)
              : undefined,
        };
        const existing = await AIRunnerSchedule.findOne({ name: schedule.name });
        if (existing) {
          if (skippedConflicts.has(decisionKey('schedules', schedule.name))) {
            imported.schedules.skipped += 1;
            continue;
          }
          Object.assign(existing, scheduleInput);
          await existing.save();
          imported.schedules.updated += 1;
        } else {
          await AIRunnerSchedule.create(scheduleInput);
          imported.schedules.created += 1;
        }
      }
    }

    ensureAIRunnerSupervisor();
    const afterPreview = await this.previewImportBundle(input.bundle, input.selectedResources);
    return { ...afterPreview, imported };
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
    await this.cancelActiveAutoflowRuns(id);
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
    await this.cancelActiveAutoflowRuns(id);
    const finishedAt = new Date();
    doc.status = 'canceled';
    doc.finishedAt = finishedAt;
    doc.items = doc.items.map((item) =>
      item.status === 'pending' || item.status === 'queued' || item.status === 'running'
        ? { ...item, status: 'canceled', finishedAt }
        : item
    );
    await doc.save();
    return mapAutoflow(doc);
  }

  private async cancelActiveAutoflowRuns(id: string): Promise<void> {
    const activeRuns = await AIRunnerRun.find({
      autoflowId: id,
      status: { $in: ['queued', 'running', 'retrying'] },
    })
      .select('_id')
      .lean();

    await Promise.all(activeRuns.map((run) => this.killRun(stringifyId(run._id))));
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
