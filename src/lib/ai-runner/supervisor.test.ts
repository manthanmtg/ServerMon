/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AIRunnerSupervisor } from './supervisor';
import connectDB from '@/lib/db';
import AIRunnerJob from '@/models/AIRunnerJob';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule from '@/models/AIRunnerSchedule';
import AIRunnerSupervisorLease from '@/models/AIRunnerSupervisorLease';
import { isAIRunnerExecutionAlive, terminateAIRunnerExecution } from './execution';
import { spawnAIRunnerWorker } from './processes';
import { enqueueRunRequest } from './queue';
import { getAIRunnerSettings } from './settings';
import { writeAIRunnerLogEntry } from './logs';
import { cleanupAIRunnerArtifacts } from './artifact-store';
import * as shared from './shared';


// Interface to access private methods for testing without using 'any'
interface TestSupervisor {
  instanceId: string;
  acquireLease(): Promise<boolean>;
  reconcileStaleJobs(): Promise<void>;
  enqueueDueSchedules(): Promise<void>;
  dispatchRunnableJobs(): Promise<void>;
}

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models/AIRunnerJob');
vi.mock('@/models/AIRunnerRun');
vi.mock('@/models/AIRunnerSchedule');
vi.mock('@/models/AIRunnerSupervisorLease');

vi.mock('./execution', () => ({
  isAIRunnerExecutionAlive: vi.fn().mockReturnValue(false),
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

vi.mock('./artifact-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./artifact-store')>();
  return {
    ...actual,
    cleanupAIRunnerArtifacts: vi.fn().mockResolvedValue([]),
  };
});

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
      artifactBaseDir: '/tmp/servermon-ai-runner',
      maxConcurrentRuns: 2,
      mongoRetentionDays: 30,
      artifactRetentionDays: 90,
    });
    (isAIRunnerExecutionAlive as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (enqueueRunRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 'run-default',
      status: 'queued',
    });
    (writeAIRunnerLogEntry as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (AIRunnerJob.findOne as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    });
    (AIRunnerRun.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      modifiedCount: 0,
    });
    (cleanupAIRunnerArtifacts as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (
      AIRunnerRun as unknown as {
        collection: {
          indexes: ReturnType<typeof vi.fn>;
          dropIndex: ReturnType<typeof vi.fn>;
        };
      }
    ).collection = {
      indexes: vi.fn().mockResolvedValue([]),
      dropIndex: vi.fn().mockResolvedValue(undefined),
    };
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
        ownerId: (supervisor as unknown as TestSupervisor).instanceId,
      });
      const result = await (supervisor as unknown as TestSupervisor).acquireLease();
      expect(result).toBe(true);
      expect(AIRunnerSupervisorLease.findOneAndUpdate).toHaveBeenCalled();
    });

    it('returns true when lease is successfully created if update fails', async () => {
      (
        AIRunnerSupervisorLease.findOneAndUpdate as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (AIRunnerSupervisorLease.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ownerId: (supervisor as unknown as TestSupervisor).instanceId,
      });
      const result = await (supervisor as unknown as TestSupervisor).acquireLease();
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
      const result = await (supervisor as unknown as TestSupervisor).acquireLease();
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
      await (supervisor as unknown as TestSupervisor).reconcileStaleJobs();

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
      await (supervisor as unknown as TestSupervisor).reconcileStaleJobs();

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
      await (supervisor as unknown as TestSupervisor).reconcileStaleJobs();

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
      await (supervisor as unknown as TestSupervisor).enqueueDueSchedules();

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
      await (supervisor as unknown as TestSupervisor).enqueueDueSchedules();

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
      await (supervisor as unknown as TestSupervisor).enqueueDueSchedules();

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
      await (supervisor as unknown as TestSupervisor).dispatchRunnableJobs();

      expect(spawnAIRunnerWorker).toHaveBeenCalledTimes(2);
      expect(AIRunnerJob.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });

    it('stops if limit reached', async () => {
      (AIRunnerJob.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2); // Limit is 2
      await (supervisor as unknown as TestSupervisor).dispatchRunnableJobs();

      expect(AIRunnerJob.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('uses the persisted max concurrent runs setting as the dispatch limit', async () => {
      (getAIRunnerSettings as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        schedulesGloballyEnabled: true,
        artifactBaseDir: '/tmp/servermon-ai-runner',
        maxConcurrentRuns: 1,
        mongoRetentionDays: 30,
        artifactRetentionDays: 90,
      });
      const candidates = [
        { _id: 'j1', runId: 'r1', attemptCount: 1, maxAttempts: 2 },
        { _id: 'j2', runId: 'r2', attemptCount: 1, maxAttempts: 2 },
      ];
      (AIRunnerJob.countDocuments as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      (AIRunnerJob.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(candidates),
      });
      (AIRunnerJob.findOneAndUpdate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        _id: 'j1',
        runId: 'r1',
        attemptCount: 1,
        maxAttempts: 2,
      });
      (spawnAIRunnerWorker as unknown as ReturnType<typeof vi.fn>).mockReturnValue(123);
      await (supervisor as unknown as TestSupervisor).dispatchRunnableJobs();

      expect(spawnAIRunnerWorker).toHaveBeenCalledTimes(1);
      expect(AIRunnerJob.findOneAndUpdate).toHaveBeenCalledTimes(1);
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
      await (supervisor as unknown as TestSupervisor).dispatchRunnableJobs();
      expect(spawnAIRunnerWorker).toHaveBeenCalledWith('j1', (supervisor as unknown as TestSupervisor).instanceId);
      expect(AIRunnerJob.findByIdAndUpdate).toHaveBeenCalledWith(
        'j1',
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'failed' }),
        })
      );
    });
  });

  describe('cleanupRetainedHistory', () => {
    it('purges old terminal run logs without deleting run or job history', async () => {
      vi.setSystemTime(new Date('2026-05-07T03:00:00.000Z'));
      (AIRunnerRun.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: 'active-run' }]),
        }),
      });
      (cleanupAIRunnerArtifacts as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await (
        supervisor as unknown as {
          cleanupRetainedHistory: () => Promise<void>;
        }
      ).cleanupRetainedHistory();

      const expectedCutoff = new Date('2026-04-07T03:00:00.000Z');
      expect(AIRunnerRun.updateMany).toHaveBeenCalledWith(
        {
          status: { $in: ['completed', 'failed', 'timeout', 'killed', 'skipped'] },
          finishedAt: { $lt: expectedCutoff },
          rawOutput: { $ne: 'Logs purged due to retention' },
        },
        {
          $set: {
            stdout: 'Logs purged due to retention',
            stderr: 'Logs purged due to retention',
            rawOutput: 'Logs purged due to retention',
          },
        }
      );
      expect(AIRunnerRun.deleteMany).not.toHaveBeenCalled();
      expect(AIRunnerJob.deleteMany).not.toHaveBeenCalled();
      expect(cleanupAIRunnerArtifacts).toHaveBeenCalledWith({
        baseDir: '/tmp/servermon-ai-runner',
        retentionDays: 90,
        activeRunIds: new Set(['active-run']),
        now: new Date('2026-05-07T03:00:00.000Z'),
      });
    });

    it('runs retention cleanup at most once every three hours', async () => {
      vi.setSystemTime(new Date('2026-05-07T03:00:00.000Z'));
      (AIRunnerRun.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      });
      (cleanupAIRunnerArtifacts as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const retentionSupervisor = new AIRunnerSupervisor();
      const cleanup = (
        retentionSupervisor as unknown as {
          cleanupRetainedHistory: () => Promise<void>;
        }
      ).cleanupRetainedHistory.bind(retentionSupervisor);

      await cleanup();
      vi.setSystemTime(new Date('2026-05-07T05:59:59.000Z'));
      await cleanup();
      vi.setSystemTime(new Date('2026-05-07T06:00:00.000Z'));
      await cleanup();

      expect(AIRunnerRun.updateMany).toHaveBeenCalledTimes(2);
      expect(cleanupAIRunnerArtifacts).toHaveBeenCalledTimes(2);
    });

    it('drops the legacy queuedAt TTL index so Mongo does not delete run history', async () => {
      vi.setSystemTime(new Date('2026-05-07T03:00:00.000Z'));
      const collection = {
        indexes: vi.fn().mockResolvedValue([
          {
            name: 'queuedAt_1',
            key: { queuedAt: 1 },
            expireAfterSeconds: 30 * 24 * 60 * 60,
          },
          {
            name: 'status_1_startedAt_-1',
            key: { status: 1, startedAt: -1 },
          },
        ]),
        dropIndex: vi.fn().mockResolvedValue(undefined),
      };
      (AIRunnerRun as unknown as { collection: typeof collection }).collection = collection;
      (AIRunnerRun.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      });
      (cleanupAIRunnerArtifacts as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await (
        supervisor as unknown as {
          cleanupRetainedHistory: () => Promise<void>;
        }
      ).cleanupRetainedHistory();

      expect(collection.dropIndex).toHaveBeenCalledWith('queuedAt_1');
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
