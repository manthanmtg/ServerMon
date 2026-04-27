/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as queue from './queue';
import AIRunnerJob, { type IAIRunnerJob } from '@/models/AIRunnerJob';
import AIRunnerProfile, { type IAIRunnerProfile } from '@/models/AIRunnerProfile';
import AIRunnerPrompt, { type IAIRunnerPrompt } from '@/models/AIRunnerPrompt';
import AIRunnerRun, { type IAIRunnerRun } from '@/models/AIRunnerRun';
import AIRunnerSchedule, { type IAIRunnerSchedule } from '@/models/AIRunnerSchedule';
import AIRunnerWorkspace from '@/models/AIRunnerWorkspace';
import * as shared from './shared';
import connectDB from '@/lib/db';
import type { AIRunnerResolvedExecution } from './shared';

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models/AIRunnerJob', () => ({
  default: {
    create: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('@/models/AIRunnerProfile', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('@/models/AIRunnerPrompt', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('@/models/AIRunnerRun', () => ({
  default: {
    create: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));

vi.mock('@/models/AIRunnerSchedule', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('@/models/AIRunnerWorkspace', () => ({
  default: {
    findById: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    ensureDirectoryExists: vi.fn().mockResolvedValue(undefined),
    resolvePromptContent: vi.fn().mockResolvedValue('resolved content'),
    resolveInvocationTemplate: vi.fn().mockReturnValue('resolved command'),
    getNextRunTimeFromExpression: vi.fn().mockReturnValue('2026-04-22T08:00:00Z'),
  };
});

describe('ai-runner queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AIRunnerWorkspace.findOne).mockResolvedValue(null);
    vi.mocked(AIRunnerWorkspace.findById).mockResolvedValue(null);
    vi.mocked(AIRunnerJob.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof AIRunnerJob.findOne>);
  });

  describe('resolveExecutionRequest', () => {
    const mockProfile = {
      _id: 'profile-1',
      enabled: true,
      defaultTimeout: 30,
      maxTimeout: 120,
      invocationTemplate: 'echo $PROMPT',
      shell: '/bin/bash',
      requiresTTY: false,
      env: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IAIRunnerProfile;

    const mockPrompt = {
      _id: 'prompt-1',
      content: 'hello',
      type: 'inline',
    } as unknown as IAIRunnerPrompt;

    it('resolves a valid manual request', async () => {
      vi.mocked(AIRunnerProfile.findById).mockResolvedValue(mockProfile);
      vi.mocked(AIRunnerPrompt.findById).mockResolvedValue(mockPrompt);

      const request = {
        promptId: 'prompt-1',
        agentProfileId: 'profile-1',
        workingDirectory: '/tmp',
        triggeredBy: 'manual' as const,
      };

      const result = await queue.resolveExecutionRequest(request);

      expect(connectDB).toHaveBeenCalled();
      expect(result.promptId).toBe('prompt-1');
      expect(result.profile._id).toBe('profile-1');
      expect(result.workingDirectory).toBe('/tmp');
      expect(result.command).toBe('resolved command');
      expect(shared.ensureDirectoryExists).toHaveBeenCalledWith('/tmp');
    });

    it('adds saved prompt attachment paths before building the command', async () => {
      vi.mocked(AIRunnerProfile.findById).mockResolvedValue(mockProfile);
      vi.mocked(AIRunnerPrompt.findById).mockResolvedValue({
        ...mockPrompt,
        attachments: [
          {
            name: 'screen.png',
            contentType: 'image/png',
            size: 4,
            data: Buffer.from('test'),
          },
        ],
      } as unknown as IAIRunnerPrompt);

      await queue.resolveExecutionRequest({
        promptId: 'prompt-1',
        agentProfileId: 'profile-1',
        workingDirectory: '/tmp',
        triggeredBy: 'manual',
      });

      expect(shared.resolveInvocationTemplate).toHaveBeenCalledWith(
        mockProfile.invocationTemplate,
        expect.stringContaining('Refer images/files in below paths:'),
        '/tmp'
      );
    });

    it('adds ad-hoc attachment paths before building the command', async () => {
      vi.mocked(AIRunnerProfile.findById).mockResolvedValue(mockProfile);

      await queue.resolveExecutionRequest({
        content: 'Review attachments',
        type: 'inline',
        agentProfileId: 'profile-1',
        workingDirectory: '/tmp',
        attachments: [
          {
            name: 'notes.txt',
            path: '/tmp/servermon-ai-runner-attachments/notes.txt',
            contentType: 'text/plain',
            size: 12,
          },
        ],
      });

      expect(shared.resolveInvocationTemplate).toHaveBeenCalledWith(
        mockProfile.invocationTemplate,
        expect.stringContaining('- /tmp/servermon-ai-runner-attachments/notes.txt'),
        '/tmp'
      );
    });

    it('resolves a valid schedule request', async () => {
      const mockSchedule = {
        _id: 'schedule-1',
        promptId: 'prompt-1',
        agentProfileId: 'profile-1',
        workingDirectory: '/tmp/schedule',
        timeout: 45,
        retries: 2,
        cronExpression: '0 * * * *',
      } as unknown as IAIRunnerSchedule;

      vi.mocked(AIRunnerSchedule.findById).mockResolvedValue(mockSchedule);
      vi.mocked(AIRunnerProfile.findById).mockResolvedValue(mockProfile);
      vi.mocked(AIRunnerPrompt.findById).mockResolvedValue(mockPrompt);

      const request = {
        scheduleId: 'schedule-1',
      };

      const result = await queue.resolveExecutionRequest(request);

      expect(result.scheduleId).toBe('schedule-1');
      expect(result.timeoutMinutes).toBe(45);
      expect(result.maxAttempts).toBe(3); // retries + 1
      expect(result.triggeredBy).toBe('schedule');
    });

    it('throws error if schedule not found', async () => {
      vi.mocked(AIRunnerSchedule.findById).mockResolvedValue(null);
      await expect(queue.resolveExecutionRequest({ scheduleId: 'non-existent' })).rejects.toThrow(
        'Schedule not found'
      );
    });

    it('throws error if prompt not found', async () => {
      vi.mocked(AIRunnerPrompt.findById).mockResolvedValue(null);
      await expect(queue.resolveExecutionRequest({ promptId: 'non-existent' })).rejects.toThrow(
        'Saved prompt not found'
      );
    });

    it('throws error if agent profile is missing', async () => {
      vi.mocked(AIRunnerPrompt.findById).mockResolvedValue(mockPrompt);
      await expect(
        queue.resolveExecutionRequest({ promptId: 'prompt-1', workingDirectory: '/tmp' })
      ).rejects.toThrow('Agent profile is required');
    });

    it('throws error if agent profile is not available', async () => {
      vi.mocked(AIRunnerProfile.findById).mockResolvedValue({
        ...mockProfile,
        enabled: false,
      } as unknown as IAIRunnerProfile);
      await expect(
        queue.resolveExecutionRequest({
          promptId: 'prompt-1',
          agentProfileId: 'profile-1',
          workingDirectory: '/tmp',
        })
      ).rejects.toThrow('Agent profile is not available');
    });

    it('throws error if working directory is missing', async () => {
      vi.mocked(AIRunnerProfile.findById).mockResolvedValue(mockProfile);
      vi.mocked(AIRunnerPrompt.findById).mockResolvedValue(mockPrompt);
      await expect(
        queue.resolveExecutionRequest({
          promptId: 'prompt-1',
          agentProfileId: 'profile-1',
        })
      ).rejects.toThrow('Working directory is required');
    });

    it('throws error if prompt content is missing', async () => {
      vi.mocked(AIRunnerProfile.findById).mockResolvedValue(mockProfile);
      vi.mocked(AIRunnerPrompt.findById).mockResolvedValue({
        _id: 'p1',
      } as unknown as IAIRunnerPrompt); // No content/type
      await expect(
        queue.resolveExecutionRequest({
          promptId: 'p1',
          agentProfileId: 'profile-1',
          workingDirectory: '/tmp',
        })
      ).rejects.toThrow('Prompt content is required');
    });
  });

  describe('enqueueResolvedRun', () => {
    const now = new Date();
    const resolved: AIRunnerResolvedExecution = {
      profile: {
        _id: 'prof1',
        name: 'Profile 1',
        slug: 'profile-1',
        agentType: 'claude-code',
        invocationTemplate: 'echo $PROMPT',
        defaultTimeout: 30,
        maxTimeout: 120,
        shell: '/bin/bash',
        requiresTTY: false,
        env: {},
        enabled: true,
        locked: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      promptContent: 'content',
      command: 'cmd',
      workingDirectory: '/dir',
      workspaceBlocking: false,
      timeoutMinutes: 10,
      maxAttempts: 2,
      triggeredBy: 'manual' as const,
    };

    it('creates run and job and returns DTO', async () => {
      const mockRun = {
        _id: 'run1',
        save: vi.fn().mockResolvedValue(undefined),
        createdAt: now,
        updatedAt: now,
        queuedAt: now,
        jobId: '',
        ...resolved,
      } as unknown as IAIRunnerRun;
      const mockJob = { _id: 'job1' } as unknown as IAIRunnerJob;

      vi.mocked(AIRunnerRun.create).mockResolvedValue(mockRun as unknown as never);
      vi.mocked(AIRunnerJob.create).mockResolvedValue(mockJob as unknown as never);

      const result = await queue.enqueueResolvedRun(resolved, { requestedAt: now });

      expect(AIRunnerRun.create).toHaveBeenCalled();
      expect(AIRunnerRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          queuedAt: now,
        })
      );
      expect(AIRunnerJob.create).toHaveBeenCalled();
      expect((mockRun as unknown as { jobId: string }).jobId).toBe('job1');
      expect(mockRun.save).toHaveBeenCalled();
      expect(result._id).toBe('run1');
    });

    it('updates schedule if scheduleId is provided', async () => {
      const resolvedWithSchedule = {
        ...resolved,
        scheduleId: 'sched1',
        scheduleCronExpression: '0 * * * *',
      };
      const mockRun = {
        _id: 'run1',
        save: vi.fn(),
        createdAt: now,
        updatedAt: now,
        queuedAt: now,
        ...resolvedWithSchedule,
      } as unknown as IAIRunnerRun;
      vi.mocked(AIRunnerRun.create).mockResolvedValue(mockRun as unknown as never);
      vi.mocked(AIRunnerJob.create).mockResolvedValue({ _id: 'job1' } as unknown as never);

      await queue.enqueueResolvedRun(resolvedWithSchedule);

      expect(AIRunnerSchedule.findByIdAndUpdate).toHaveBeenCalledWith(
        'sched1',
        expect.objectContaining({
          lastRunId: 'run1',
          lastRunStatus: 'queued',
        })
      );
    });

    it('records a skipped run without creating a job when the profile is locked', async () => {
      const lockedResolved: AIRunnerResolvedExecution = {
        ...resolved,
        scheduleId: 'sched1',
        scheduleCronExpression: '0 * * * *',
        triggeredBy: 'schedule',
        profile: {
          ...resolved.profile,
          locked: true,
          lockedAt: now.toISOString(),
          lockedUntil: new Date(now.getTime() + 60_000).toISOString(),
        },
      };
      const mockRun = {
        _id: 'run-skipped',
        createdAt: now,
        updatedAt: now,
        queuedAt: now,
        ...lockedResolved,
        status: 'skipped',
        stdout: '',
        stderr: '',
        rawOutput: '',
        triggeredBy: 'schedule',
        recoveryState: 'skipped_agent_lock',
      } as unknown as IAIRunnerRun;

      vi.mocked(AIRunnerRun.create).mockResolvedValue(mockRun as unknown as never);

      const result = await queue.enqueueResolvedRun(lockedResolved, { requestedAt: now });

      expect(AIRunnerRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'skipped',
          recoveryState: 'skipped_agent_lock',
          lastError: expect.stringContaining('Profile is locked'),
        })
      );
      expect(AIRunnerJob.create).not.toHaveBeenCalled();
      expect(AIRunnerSchedule.findByIdAndUpdate).toHaveBeenCalledWith(
        'sched1',
        expect.objectContaining({
          lastRunId: 'run-skipped',
          lastRunStatus: 'skipped',
        })
      );
      expect(result.status).toBe('skipped');
      expect(result.recoveryState).toBe('skipped_agent_lock');
    });

    it('uses the request time as scheduledFor for manual runs tied to a schedule', async () => {
      const manualScheduledRun = {
        ...resolved,
        scheduleId: 'sched1',
        scheduleCronExpression: '0 * * * *',
        triggeredBy: 'manual' as const,
      };
      const startedAt = new Date('2026-04-22T08:00:00.000Z');
      const mockRun = {
        _id: 'run1',
        save: vi.fn(),
        createdAt: startedAt,
        updatedAt: startedAt,
        queuedAt: startedAt,
        ...manualScheduledRun,
      } as unknown as IAIRunnerRun;

      vi.mocked(AIRunnerRun.create).mockResolvedValue(mockRun as unknown as never);
      vi.mocked(AIRunnerJob.create).mockResolvedValue({ _id: 'job1' } as unknown as never);

      await queue.enqueueResolvedRun(manualScheduledRun, {
        requestedAt: startedAt,
      });

      expect(AIRunnerJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: 'sched1',
          scheduledFor: startedAt,
          triggeredBy: 'manual',
        })
      );
      expect(AIRunnerSchedule.findByIdAndUpdate).toHaveBeenCalledWith(
        'sched1',
        expect.objectContaining({
          lastScheduledFor: undefined,
        })
      );
    });

    it('deletes run if job creation fails', async () => {
      const mockRun = { _id: 'run1', save: vi.fn() } as unknown as IAIRunnerRun;
      vi.mocked(AIRunnerRun.create).mockResolvedValue(mockRun as unknown as never);
      vi.mocked(AIRunnerJob.create).mockRejectedValue(new Error('Job creation failed'));

      await expect(queue.enqueueResolvedRun(resolved)).rejects.toThrow('Job creation failed');

      expect(AIRunnerRun.findByIdAndDelete).toHaveBeenCalledWith('run1');
    });
  });

  describe('enqueueRunRequest', () => {
    it('resolves and enqueues a request', async () => {
      const now = new Date();
      // Mocking resolveExecutionRequest would be better but it's in the same file.
      // We'll mock the internal calls it makes.
      vi.mocked(AIRunnerProfile.findById).mockResolvedValue({
        _id: 'p1',
        enabled: true,
        defaultTimeout: 10,
        maxTimeout: 60,
        createdAt: now,
        updatedAt: now,
        env: new Map(),
      } as unknown as IAIRunnerProfile);
      vi.mocked(AIRunnerPrompt.findById).mockResolvedValue({
        _id: 'pr1',
        content: 'c',
        type: 'inline',
      } as unknown as IAIRunnerPrompt);
      vi.mocked(AIRunnerRun.create).mockResolvedValue({
        _id: 'r1',
        save: vi.fn(),
        createdAt: now,
        updatedAt: now,
        queuedAt: now,
        agentProfileId: 'p1',
        promptContent: 'c',
        workingDirectory: '/tmp',
        command: 'resolved command',
        status: 'queued',
        triggeredBy: 'manual',
      } as unknown as IAIRunnerRun as unknown as never);
      vi.mocked(AIRunnerJob.create).mockResolvedValue({
        _id: 'j1',
      } as unknown as IAIRunnerJob as unknown as never);

      const result = await queue.enqueueRunRequest({
        promptId: 'pr1',
        agentProfileId: 'p1',
        workingDirectory: '/tmp',
      });

      expect(result._id).toBe('r1');
    });
  });
});
