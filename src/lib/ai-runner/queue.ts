import connectDB from '@/lib/db';
import AIRunnerJob from '@/models/AIRunnerJob';
import AIRunnerProfile from '@/models/AIRunnerProfile';
import AIRunnerPrompt, { type IAIRunnerPrompt } from '@/models/AIRunnerPrompt';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule, { type IAIRunnerSchedule } from '@/models/AIRunnerSchedule';
import AIRunnerWorkspace from '@/models/AIRunnerWorkspace';
import type {
  AIRunnerExecuteRequest,
  AIRunnerRunDTO,
  AIRunnerTrigger,
} from '@/modules/ai-runner/types';
import {
  DEFAULT_MAX_ATTEMPTS,
  PROFILE_LOCK_RECOVERY_STATE,
  ensureDirectoryExists,
  getNextRunTimeFromExpression,
  mapProfile,
  mapRun,
  resolveInvocationTemplate,
  resolvePromptContent,
  stringifyId,
  type AIRunnerResolvedExecution,
} from './shared';
import { writeAIRunnerLogEntry } from './logs';
import {
  appendAttachmentReferencesToPrompt,
  materializePromptAttachments,
  normalizeAttachmentRefs,
  type StoredPromptAttachment,
} from './attachments';

interface LegacyPromptRuntime {
  agentProfileId?: unknown;
  workingDirectory?: unknown;
  timeout?: unknown;
}

async function resolveWorkspace(input: {
  workspaceId?: string;
  workingDirectory?: string;
}): Promise<{ workspaceId?: string; workingDirectory?: string; blocking: boolean }> {
  if (input.workspaceId) {
    const workspace = await AIRunnerWorkspace.findById(input.workspaceId);
    if (!workspace || !workspace.enabled) {
      throw new Error('Workspace is not available');
    }
    return {
      workspaceId: stringifyId(workspace._id),
      workingDirectory: workspace.path,
      blocking: Boolean(workspace.blocking),
    };
  }

  if (!input.workingDirectory) {
    return { blocking: false };
  }

  const workspace = await AIRunnerWorkspace.findOne({
    path: input.workingDirectory,
    enabled: true,
  });
  if (!workspace) {
    return { workingDirectory: input.workingDirectory, blocking: false };
  }

  return {
    workspaceId: stringifyId(workspace._id),
    workingDirectory: workspace.path,
    blocking: Boolean(workspace.blocking),
  };
}

async function assertWorkspaceCanQueue(resolved: AIRunnerResolvedExecution): Promise<void> {
  if (!resolved.workspaceBlocking || !resolved.workspaceId) return;

  const activeJob = await AIRunnerJob.findOne({
    workspaceId: resolved.workspaceId,
    workspaceBlocking: true,
    status: { $in: ['queued', 'dispatched', 'running', 'retrying'] },
    cancelRequestedAt: { $exists: false },
  }).select('_id runId triggeredBy');

  if (!activeJob) return;

  throw new Error(
    'Workspace is blocked by an active or queued AI Runner job. Wait for it to finish or disable blocking for this workspace.'
  );
}

function getProfileLockMessage(resolved: AIRunnerResolvedExecution): string {
  return resolved.profile.lockedUntil
    ? `Profile is locked until ${new Date(resolved.profile.lockedUntil).toISOString()}`
    : 'Profile is locked indefinitely';
}

async function updateLinkedScheduleAfterRun(
  resolved: AIRunnerResolvedExecution,
  runId: unknown,
  status: 'queued' | 'skipped',
  queuedAt: Date,
  scheduledFor?: Date
): Promise<void> {
  if (!resolved.scheduleId) return;

  const nextRunTime = getNextRunTimeFromExpression(
    resolved.scheduleCronExpression ?? '',
    new Date((scheduledFor ?? queuedAt).getTime() + 60_000)
  );
  await AIRunnerSchedule.findByIdAndUpdate(resolved.scheduleId, {
    lastRunId: runId,
    lastRunStatus: status,
    lastRunAt: queuedAt,
    lastScheduledFor: scheduledFor,
    nextRunTime: nextRunTime ? new Date(nextRunTime) : undefined,
  });
}

export async function resolveExecutionRequest(
  request: AIRunnerExecuteRequest
): Promise<AIRunnerResolvedExecution> {
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

  const legacyPromptRuntime = (promptDoc as (IAIRunnerPrompt & LegacyPromptRuntime) | null) ?? null;
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
    (typeof legacyPromptRuntime?.workingDirectory === 'string'
      ? legacyPromptRuntime.workingDirectory
      : undefined);
  if (!workingDirectory) {
    throw new Error('Working directory is required');
  }
  const workspace = await resolveWorkspace({
    workspaceId:
      request.workspaceId ??
      (scheduleDoc?.workspaceId ? stringifyId(scheduleDoc.workspaceId) : undefined),
    workingDirectory,
  });
  const resolvedWorkingDirectory = workspace.workingDirectory ?? workingDirectory;
  await ensureDirectoryExists(resolvedWorkingDirectory);

  const promptType = request.type ?? promptDoc?.type;
  const promptSource = request.content ?? promptDoc?.content;
  if (!promptType || !promptSource) {
    throw new Error('Prompt content is required');
  }

  const basePromptContent = await resolvePromptContent(promptType, promptSource);
  const savedAttachmentPaths = promptDoc
    ? await materializePromptAttachments(
        ((promptDoc.attachments ?? []) as StoredPromptAttachment[]).filter(Boolean),
        { prefix: `prompt-${stringifyId(promptDoc._id)}` }
      )
    : [];
  const adHocAttachmentPaths = normalizeAttachmentRefs(request.attachments).map(
    (attachment) => attachment.path
  );
  const promptContent = appendAttachmentReferencesToPrompt(basePromptContent, [
    ...savedAttachmentPaths,
    ...adHocAttachmentPaths,
  ]);
  const legacyTimeout =
    typeof legacyPromptRuntime?.timeout === 'number' ? legacyPromptRuntime.timeout : undefined;
  const timeoutMinutes = Math.min(
    Math.max(request.timeout ?? scheduleDoc?.timeout ?? legacyTimeout ?? profile.defaultTimeout, 1),
    profile.maxTimeout
  );
  const command = resolveInvocationTemplate(
    profile.invocationTemplate,
    promptContent,
    resolvedWorkingDirectory
  );

  return {
    promptId: promptDoc ? stringifyId(promptDoc._id) : undefined,
    scheduleId: scheduleDoc ? stringifyId(scheduleDoc._id) : undefined,
    autoflowId: request.autoflowId,
    autoflowItemId: request.autoflowItemId,
    scheduleCronExpression: scheduleDoc?.cronExpression,
    profile,
    workspaceId: workspace.workspaceId,
    workspaceBlocking: workspace.blocking,
    promptContent,
    command,
    workingDirectory: resolvedWorkingDirectory,
    timeoutMinutes,
    maxAttempts:
      scheduleDoc && typeof scheduleDoc.retries === 'number'
        ? Math.min(Math.max(Number(scheduleDoc.retries), 0), 9) + 1
        : DEFAULT_MAX_ATTEMPTS,
    triggeredBy: request.triggeredBy ?? (scheduleDoc ? 'schedule' : 'manual'),
  };
}

export async function enqueueResolvedRun(
  resolved: AIRunnerResolvedExecution,
  options?: {
    scheduledFor?: Date;
    requestedAt?: Date;
    maxAttempts?: number;
  }
): Promise<AIRunnerRunDTO> {
  await connectDB();

  const queuedAt = options?.requestedAt ?? new Date();
  const jobScheduledFor = options?.scheduledFor ?? (resolved.scheduleId ? queuedAt : undefined);

  if (resolved.profile.locked) {
    const message = getProfileLockMessage(resolved);
    const runDoc = await AIRunnerRun.create({
      promptId: resolved.promptId,
      scheduleId: resolved.scheduleId,
      autoflowId: resolved.autoflowId,
      autoflowItemId: resolved.autoflowItemId,
      agentProfileId: resolved.profile._id,
      workspaceId: resolved.workspaceId,
      promptContent: resolved.promptContent,
      workingDirectory: resolved.workingDirectory,
      command: resolved.command,
      status: 'skipped',
      stdout: '',
      stderr: '',
      rawOutput: '',
      queuedAt,
      scheduledFor: jobScheduledFor,
      finishedAt: queuedAt,
      triggeredBy: resolved.triggeredBy,
      jobStatus: undefined,
      attemptCount: 0,
      maxAttempts: options?.maxAttempts ?? resolved.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      lastError: message,
      recoveryState: PROFILE_LOCK_RECOVERY_STATE,
    });

    void writeAIRunnerLogEntry({
      level: 'info',
      component: 'ai-runner:queue',
      event: 'run.skipped_agent_lock',
      message: 'Skipped AI Runner job because the profile is locked',
      data: {
        runId: stringifyId(runDoc._id),
        scheduleId: resolved.scheduleId,
        autoflowId: resolved.autoflowId,
        autoflowItemId: resolved.autoflowItemId,
        promptId: resolved.promptId,
        profileId: resolved.profile._id,
        lockedUntil: resolved.profile.lockedUntil,
        workspaceId: resolved.workspaceId,
        triggeredBy: resolved.triggeredBy,
        queuedAt: queuedAt.toISOString(),
        scheduledFor: jobScheduledFor?.toISOString(),
        workingDirectory: resolved.workingDirectory,
      },
    });

    await updateLinkedScheduleAfterRun(
      resolved,
      runDoc._id,
      'skipped',
      queuedAt,
      options?.scheduledFor
    );

    return mapRun(runDoc);
  }

  if (resolved.triggeredBy === 'manual') {
    await assertWorkspaceCanQueue(resolved);
  }
  const runDoc = await AIRunnerRun.create({
    promptId: resolved.promptId,
    scheduleId: resolved.scheduleId,
    autoflowId: resolved.autoflowId,
    autoflowItemId: resolved.autoflowItemId,
    agentProfileId: resolved.profile._id,
    workspaceId: resolved.workspaceId,
    promptContent: resolved.promptContent,
    workingDirectory: resolved.workingDirectory,
    command: resolved.command,
    status: 'queued',
    stdout: '',
    stderr: '',
    rawOutput: '',
    queuedAt,
    scheduledFor: jobScheduledFor,
    triggeredBy: resolved.triggeredBy,
    jobStatus: 'queued',
    attemptCount: 0,
    maxAttempts: options?.maxAttempts ?? resolved.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
  });

  let jobDoc;
  try {
    jobDoc = await AIRunnerJob.create({
      runId: runDoc._id,
      promptId: resolved.promptId,
      scheduleId: resolved.scheduleId,
      autoflowId: resolved.autoflowId,
      autoflowItemId: resolved.autoflowItemId,
      agentProfileId: resolved.profile._id,
      workspaceId: resolved.workspaceId,
      workspaceBlocking: resolved.workspaceBlocking,
      triggeredBy: resolved.triggeredBy,
      promptContent: resolved.promptContent,
      workingDirectory: resolved.workingDirectory,
      command: resolved.command,
      shell: resolved.profile.shell,
      requiresTTY: resolved.profile.requiresTTY,
      env: resolved.profile.env,
      timeoutMinutes: resolved.timeoutMinutes,
      status: 'queued',
      nextAttemptAt: queuedAt,
      scheduledFor: jobScheduledFor,
      maxAttempts: options?.maxAttempts ?? resolved.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    });
  } catch (error) {
    await AIRunnerRun.findByIdAndDelete(runDoc._id);
    throw error;
  }

  runDoc.jobId = jobDoc._id;
  await runDoc.save();

  void writeAIRunnerLogEntry({
    level: 'info',
    component: 'ai-runner:queue',
    event: 'run.queued',
    message: 'Queued AI Runner job',
    data: {
      runId: stringifyId(runDoc._id),
      jobId: stringifyId(jobDoc._id),
      scheduleId: resolved.scheduleId,
      autoflowId: resolved.autoflowId,
      autoflowItemId: resolved.autoflowItemId,
      promptId: resolved.promptId,
      profileId: resolved.profile._id,
      workspaceId: resolved.workspaceId,
      workspaceBlocking: resolved.workspaceBlocking,
      triggeredBy: resolved.triggeredBy,
      queuedAt: queuedAt.toISOString(),
      scheduledFor: jobScheduledFor?.toISOString(),
      workingDirectory: resolved.workingDirectory,
    },
  });

  await updateLinkedScheduleAfterRun(
    resolved,
    runDoc._id,
    'queued',
    queuedAt,
    options?.scheduledFor
  );

  return mapRun(runDoc);
}

export async function enqueueRunRequest(
  request: AIRunnerExecuteRequest,
  options?: {
    scheduledFor?: Date;
    requestedAt?: Date;
    maxAttempts?: number;
    triggeredBy?: AIRunnerTrigger;
  }
): Promise<AIRunnerRunDTO> {
  const resolved = await resolveExecutionRequest({
    ...request,
    triggeredBy: options?.triggeredBy ?? request.triggeredBy,
  });
  return enqueueResolvedRun(resolved, options);
}
