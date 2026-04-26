/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AIRunnerSupervisor } from './supervisor';
import connectDB from '@/lib/db';
import AIRunnerJob from '@/models/AIRunnerJob';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule from '@/models/AIRunnerSchedule';
import AIRunnerSupervisorLease from '@/models/AIRunnerSupervisorLease';
import { terminateAIRunnerExecution } from './execution';
import { spawnAIRunnerWorker } from './processes';
import { enqueueRunRequest } from './queue';
import { getAIRunnerSettings } from './settings';
import { writeAIRunnerLogEntry } from './logs';
import * as shared from './shared';

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models/AIRunnerJob');
vi.mock('@/models/AIRunnerRun');
vi.mock('@/models/AIRunnerSchedule');
vi.mock('@/models/AIRunnerSupervisorLease');

vi.mock('./execution', () => ({
  terminateAIRunnerExecution: vi.fn(),
}));

vi.mock('./processes', () => ({
  spawnAIRunnerWorker: vi.fn(),
}));

vi.mock('./queue', () => ({
  enqueueRunRequest: vi.fn(),
}));

vi.mock('./settings', () => ({
  getAIRunnerSettings: vi.fn(),
}));

vi.mock('./logs', () => ({
  writeAIRunnerLogEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shared')>();
  return {
    ...actual,
    getNextRunTimeFromExpression: vi.fn().mockReturnValue(new Date()),
    getMaxConcurrentRuns: vi.fn().mockReturnValue(2),
  };
});

describe('AIRunnerSupervisor', () => {
  let supervisor: AIRunnerSupervisor;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    // Re-mock shared BEFORE instantiating supervisor
    (shared.getMaxConcurrentRuns as unknown as ReturnType<typeof vi.fn>).mockReturnValue(2);
    (shared.getNextRunTimeFromExpression as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Date()
    );
    (getAIRunnerSettings as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      schedulesGloballyEnabled: true,
    });
    (writeAIRunnerLogEntry as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (AIRunnerJob.findOne as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    });
    supervisor = new AIRunnerSupervisor();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquireLease', () => {
    it('returns true when lease is successfully updated', async () => {
      (
        AIRunnerSupervisorLease.findOneAndUpdate as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ownerId: (supervisor as any).instanceId,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supervisor as any).acquireLease();
      expect(result).toBe(true);
      expect(AIRunnerSupervisorLease.findOneAndUpdate).toHaveBeenCalled();
    });

    it('returns true when lease is successfully created if update fails', async () => {
      (
        AIRunnerSupervisorLease.findOneAndUpdate as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (AIRunnerSupervisorLease.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ownerId: (supervisor as any).instanceId,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supervisor as any).acquireLease();
      expect(result).toBe(true);
      expect(AIRunnerSupervisorLease.create).toHaveBeenCalled();
    });

    it('returns false when lease is owned by someone else', async () => {
      (
        AIRunnerSupervisorLease.findOneAndUpdate as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (AIRunnerSupervisorLease.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('duplicate')
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (supervisor as any).acquireLease();
      expect(result).toBe(false);
    });
  });

  describe('reconcileStaleJobs', () => {
    it('retries a job if it is retryable', async () => {
      const mockJob = {
        _id: 'job-1',
        runId: 'run-1',
        status: 'running',
        attemptCount: 1,
        maxAttempts: 2,
        startedAt: new Date(Date.now() - 1000),
        timeoutMinutes: 10,
        workerPid: 123,
      };

      (AIRunnerJob.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockResolvedValue([mockJob]),
      });
      (AIRunnerRun.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: 'run-1',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supervisor as any).reconcileStaleJobs();

      expect(terminateAIRunnerExecution).toHaveBeenCalled();
      expect(AIRunnerJob.findByIdAndUpdate).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'retrying' }),
        })
      );
    });

    it('marks a job as failed if it is not retryable', async () => {
      const mockJob = {
        _id: 'job-1',
        runId: 'run-1',
        status: 'running',
        attemptCount: 2,
        maxAttempts: 2,
        startedAt: new Date(Date.now() - 1000),
        timeoutMinutes: 10,
        workerPid: 123,
      };

      (AIRunnerJob.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockResolvedValue([mockJob]),
      });
      (AIRunnerRun.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: 'run-1',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supervisor as any).reconcileStaleJobs();

      expect(AIRunnerJob.findByIdAndUpdate).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'failed' }),
        })
      );
    });

    it('marks a job as timeout if it exceeded its window', async () => {
      const mockJob = {
        _id: 'job-1',
        runId: 'run-1',
        status: 'running',
        attemptCount: 1,
        maxAttempts: 2,
        startedAt: new Date(Date.now() - 20 * 60_000),
        timeoutMinutes: 10,
        workerPid: 123,
      };

      (AIRunnerJob.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockResolvedValue([mockJob]),
      });
      (AIRunnerRun.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: 'run-1',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supervisor as any).reconcileStaleJobs();

      expect(AIRunnerRun.findByIdAndUpdate).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'timeout' }),
        })
      );
    });
  });

  describe('enqueueDueSchedules', () => {
    it('enqueues due schedules', async () => {
      const mockSchedule = {
        _id: 's1',
        promptId: 'p1',
        nextRunTime: new Date(Date.now() - 1000),
        cronExpression: '* * * * *',
        save: vi.fn().mockResolvedValue(true),
      };

      (AIRunnerSchedule.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockResolvedValue([mockSchedule]),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supervisor as any).enqueueDueSchedules();

      expect(enqueueRunRequest).toHaveBeenCalled();
      expect(mockSchedule.save).toHaveBeenCalled();
    });

    it('handles duplicate enqueues gracefully', async () => {
      const mockSchedule = {
        _id: 's1',
        promptId: 'p1',
        nextRunTime: new Date(Date.now() - 1000),
        cronExpression: '* * * * *',
        save: vi.fn().mockResolvedValue(true),
      };

      (AIRunnerSchedule.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockResolvedValue([mockSchedule]),
      });
      (enqueueRunRequest as unknown as ReturnType<typeof vi.fn>).mockRejectedValue({ code: 11000 });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supervisor as any).enqueueDueSchedules();

      expect(enqueueRunRequest).toHaveBeenCalled();
      expect(mockSchedule.save).toHaveBeenCalled(); // Still saves to update nextRunTime
    });

    it('logs enqueue failures and continues advancing schedules', async () => {
      const badNextRunTime = new Date(Date.now() - 2_000);
      const goodNextRunTime = new Date(Date.now() - 1_000);
      const badFuture = new Date(Date.now() + 60_000);
      const goodFuture = new Date(Date.now() + 120_000);
      const badSchedule = {
        _id: 'bad-schedule',
        name: 'Bad schedule',
        promptId: 'missing-prompt',
        agentProfileId: 'profile-1',
        workingDirectory: '/tmp/missing',
        nextRunTime: badNextRunTime,
        cronExpression: '* * * * *',
        save: vi.fn().mockResolvedValue(true),
      };
      const goodSchedule = {
        _id: 'good-schedule',
        name: 'Good schedule',
        promptId: 'prompt-1',
        agentProfileId: 'profile-1',
        workingDirectory: '/tmp',
        nextRunTime: goodNextRunTime,
        cronExpression: '* * * * *',
        save: vi.fn().mockResolvedValue(true),
      };

      (AIRunnerSchedule.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockResolvedValue([badSchedule, goodSchedule]),
      });
      (enqueueRunRequest as unknown as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Saved prompt not found'))
        .mockResolvedValueOnce({});
      (shared.getNextRunTimeFromExpression as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(badFuture)
        .mockReturnValueOnce(goodFuture);

      await (
        supervisor as unknown as {
          enqueueDueSchedules: () => Promise<void>;
        }
      ).enqueueDueSchedules();

      expect(enqueueRunRequest).toHaveBeenCalledTimes(2);
      expect(badSchedule.nextRunTime).toEqual(badFuture);
      expect(goodSchedule.nextRunTime).toEqual(goodFuture);
      expect(badSchedule.save).toHaveBeenCalled();
      expect(goodSchedule.save).toHaveBeenCalled();
      expect(writeAIRunnerLogEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          event: 'schedule.enqueue_failed',
          data: expect.objectContaining({
            scheduleId: 'bad-schedule',
            promptId: 'missing-prompt',
            error: 'Saved prompt not found',
          }),
        })
      );
    });

    it('skips queueing while global schedules are disabled', async () => {
      const mockSchedule = {
        _id: 's1',
        promptId: 'p1',
        nextRunTime: new Date(Date.now() - 1000),
        cronExpression: '* * * * *',
        save: vi.fn().mockResolvedValue(true),
      };

      (getAIRunnerSettings as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        schedulesGloballyEnabled: false,
      });
      (AIRunnerSchedule.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockResolvedValue([mockSchedule]),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supervisor as any).enqueueDueSchedules();

      expect(enqueueRunRequest).not.toHaveBeenCalled();
      expect(mockSchedule.save).toHaveBeenCalled();
    });
  });

  describe('dispatchRunnableJobs', () => {
    it('dispatches jobs until concurrency limit', async () => {
      const candidates = [
        { _id: 'j1', runId: 'r1', attemptCount: 1, maxAttempts: 2 },
        { _id: 'j2', runId: 'r2', attemptCount: 1, maxAttempts: 2 },
      ];
      (AIRunnerJob.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      (AIRunnerJob.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValueOnce(candidates)
          .mockResolvedValueOnce([candidates[1]])
          .mockResolvedValueOnce([]),
      });
      (AIRunnerJob.findOneAndUpdate as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ _id: 'j1', runId: 'r1', attemptCount: 1, maxAttempts: 2 })
        .mockResolvedValueOnce({ _id: 'j2', runId: 'r2', attemptCount: 1, maxAttempts: 2 })
        .mockResolvedValueOnce(null);
      (spawnAIRunnerWorker as unknown as ReturnType<typeof vi.fn>).mockReturnValue(123);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supervisor as any).dispatchRunnableJobs();

      expect(spawnAIRunnerWorker).toHaveBeenCalledTimes(2);
      expect(AIRunnerJob.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });

    it('stops if limit reached', async () => {
      (AIRunnerJob.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2); // Limit is 2

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supervisor as any).dispatchRunnableJobs();

      expect(AIRunnerJob.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('handles worker spawn failure', async () => {
      (AIRunnerJob.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      (AIRunnerJob.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi
          .fn()
          .mockResolvedValueOnce([
            {
              _id: 'j1',
              runId: 'r1',
              attemptCount: 1,
              maxAttempts: 2,
            },
          ])
          .mockResolvedValueOnce([]),
      });
      (AIRunnerJob.findOneAndUpdate as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          _id: 'j1',
          runId: 'r1',
          attemptCount: 1,
          maxAttempts: 2,
        })
        .mockResolvedValueOnce(null);
      (spawnAIRunnerWorker as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supervisor as any).dispatchRunnableJobs();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(spawnAIRunnerWorker).toHaveBeenCalledWith('j1', (supervisor as any).instanceId);
      expect(AIRunnerJob.findByIdAndUpdate).toHaveBeenCalledWith(
        'j1',
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'failed' }),
        })
      );
    });
  });

  describe('run', () => {
    it('stops if lease cannot be acquired', async () => {
      (
        AIRunnerSupervisorLease.findOneAndUpdate as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (AIRunnerSupervisorLease.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('duplicate')
      );

      await supervisor.run();

      expect(connectDB).toHaveBeenCalled();
      expect(AIRunnerSupervisorLease.findOneAndUpdate).toHaveBeenCalled();
      expect(AIRunnerJob.find).not.toHaveBeenCalled(); // tick not called
    });
  });
});
