import connectDB from '@/lib/db';
import AIRunnerJob from '@/models/AIRunnerJob';
import AIRunnerProfile from '@/models/AIRunnerProfile';
import AIRunnerPrompt, { type IAIRunnerPrompt } from '@/models/AIRunnerPrompt';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule, { type IAIRunnerSchedule } from '@/models/AIRunnerSchedule';
import type {
  AIRunnerExecuteRequest,
  AIRunnerRunDTO,
  AIRunnerTrigger,
} from '@/modules/ai-runner/types';
import {
  DEFAULT_MAX_ATTEMPTS,
  ensureDirectoryExists,
  getNextRunTimeFromExpression,
  mapProfile,
  mapRun,
  resolveInvocationTemplate,
  resolvePromptContent,
  stringifyId,
  type AIRunnerResolvedExecution,
} from './shared';

interface LegacyPromptRuntime {
  agentProfileId?: unknown;
  workingDirectory?: unknown;
  timeout?: unknown;
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
  await ensureDirectoryExists(workingDirectory);

  const promptType = request.type ?? promptDoc?.type;
  const promptSource = request.content ?? promptDoc?.content;
  if (!promptType || !promptSource) {
    throw new Error('Prompt content is required');
  }

  const promptContent = await resolvePromptContent(promptType, promptSource);
  const legacyTimeout =
    typeof legacyPromptRuntime?.timeout === 'number' ? legacyPromptRuntime.timeout : undefined;
  const timeoutMinutes = Math.min(
    Math.max(request.timeout ?? scheduleDoc?.timeout ?? legacyTimeout ?? profile.defaultTimeout, 1),
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

  const startedAt = options?.requestedAt ?? new Date();
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
    startedAt,
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
      agentProfileId: resolved.profile._id,
      triggeredBy: resolved.triggeredBy,
      promptContent: resolved.promptContent,
      workingDirectory: resolved.workingDirectory,
      command: resolved.command,
      shell: resolved.profile.shell,
      requiresTTY: resolved.profile.requiresTTY,
      env: resolved.profile.env,
      timeoutMinutes: resolved.timeoutMinutes,
      status: 'queued',
      nextAttemptAt: startedAt,
      scheduledFor: options?.scheduledFor,
      maxAttempts: options?.maxAttempts ?? resolved.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    });
  } catch (error) {
    await AIRunnerRun.findByIdAndDelete(runDoc._id);
    throw error;
  }

  runDoc.jobId = jobDoc._id;
  await runDoc.save();

  if (resolved.scheduleId) {
    const nextRunTime = getNextRunTimeFromExpression(
      resolved.scheduleCronExpression ?? '',
      new Date((options?.scheduledFor ?? startedAt).getTime() + 60_000)
    );
    await AIRunnerSchedule.findByIdAndUpdate(resolved.scheduleId, {
      lastRunId: runDoc._id,
      lastRunStatus: 'queued',
      lastRunAt: startedAt,
      lastScheduledFor: options?.scheduledFor,
      nextRunTime: nextRunTime ? new Date(nextRunTime) : undefined,
    });
  }

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
