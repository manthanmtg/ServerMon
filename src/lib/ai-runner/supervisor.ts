import { randomUUID } from 'node:crypto';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import AIRunnerJob from '@/models/AIRunnerJob';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule from '@/models/AIRunnerSchedule';
import AIRunnerSupervisorLease from '@/models/AIRunnerSupervisorLease';
import type { AIRunnerRunStatus } from '@/modules/ai-runner/types';
import { spawnAIRunnerWorker } from './processes';
import { enqueueRunRequest } from './queue';
import {
  DEFAULT_HEARTBEAT_STALE_MS,
  DEFAULT_LEASE_TTL_MS,
  DEFAULT_MAX_CONCURRENT_RUNS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_SUPERVISOR_TICK_MS,
  LEASE_ID,
  MAX_SCHEDULE_CATCHUP_RUNS,
  getNextRunTimeFromExpression,
  shouldRetryJob,
  stringifyId,
} from './shared';

const log = createLogger('ai-runner:supervisor');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AIRunnerSupervisor {
  private readonly instanceId =
    process.env.AI_RUNNER_SUPERVISOR_INSTANCE_ID || `${process.pid}-${randomUUID()}`;

  private readonly tickMs = DEFAULT_SUPERVISOR_TICK_MS;

  async run(): Promise<void> {
    await connectDB();

    while (true) {
      const hasLease = await this.acquireLease();
      if (!hasLease) {
        return;
      }

      try {
        await this.tick();
      } catch (error) {
        log.error('Supervisor tick failed', error);
      }

      await sleep(this.tickMs);
    }
  }

  private async acquireLease(): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_LEASE_TTL_MS);
    let lease = await AIRunnerSupervisorLease.findOneAndUpdate(
      {
        _id: LEASE_ID,
        $or: [{ ownerId: this.instanceId }, { expiresAt: { $lte: now } }],
      },
      {
        $set: {
          ownerId: this.instanceId,
          heartbeatAt: now,
          expiresAt,
        },
      },
      {
        new: true,
      }
    );

    if (!lease) {
      try {
        lease = await AIRunnerSupervisorLease.create({
          _id: LEASE_ID,
          ownerId: this.instanceId,
          heartbeatAt: now,
          expiresAt,
        });
      } catch {
        return false;
      }
    }

    return lease?.ownerId === this.instanceId;
  }

  private async tick(): Promise<void> {
    await this.reconcileStaleJobs();
    await this.enqueueDueSchedules();
    await this.dispatchRunnableJobs();
  }

  private async reconcileStaleJobs(): Promise<void> {
    const staleBefore = new Date(Date.now() - DEFAULT_HEARTBEAT_STALE_MS);
    const staleJobs = await AIRunnerJob.find({
      status: { $in: ['dispatched', 'running'] },
      heartbeatAt: { $lte: staleBefore },
    }).sort({ updatedAt: 1 });

    for (const job of staleJobs) {
      const run = await AIRunnerRun.findById(job.runId);
      const timedOut =
        job.startedAt != null && Date.now() > job.startedAt.getTime() + job.timeoutMinutes * 60_000;
      const cancelled = job.cancelRequestedAt != null;
      const retryable = !cancelled && !timedOut && shouldRetryJob(job);

      if (retryable) {
        const nextAttemptAt = new Date(Date.now() + DEFAULT_RETRY_DELAY_MS);
        await Promise.all([
          AIRunnerJob.findByIdAndUpdate(job._id, {
            $set: {
              status: 'retrying',
              nextAttemptAt,
              heartbeatAt: undefined,
              childPid: undefined,
              workerPid: undefined,
              lastError: 'Worker heartbeat went stale and the job was queued for retry',
            },
          }),
          AIRunnerRun.findByIdAndUpdate(job.runId, {
            $set: {
              status: 'retrying',
              jobStatus: 'retrying',
              heartbeatAt: undefined,
              pid: undefined,
              attemptCount: job.attemptCount,
              maxAttempts: job.maxAttempts,
              lastError: 'Worker heartbeat went stale and the run was queued for retry',
            },
            $unset: {
              finishedAt: '',
              durationSeconds: '',
            },
          }),
        ]);

        if (run?.scheduleId) {
          await AIRunnerSchedule.findByIdAndUpdate(run.scheduleId, {
            lastRunId: run._id,
            lastRunStatus: 'retrying',
            lastRunAt: new Date(),
          });
        }
        continue;
      }

      const terminalStatus: AIRunnerRunStatus = cancelled
        ? 'killed'
        : timedOut
          ? 'timeout'
          : 'failed';
      const jobStatus = terminalStatus === 'killed' ? 'canceled' : 'failed';
      const finishedAt = new Date();
      const durationSeconds =
        job.startedAt != null
          ? Math.max(0, Math.round((finishedAt.getTime() - job.startedAt.getTime()) / 1000))
          : undefined;

      await Promise.all([
        AIRunnerJob.findByIdAndUpdate(job._id, {
          $set: {
            status: jobStatus,
            finishedAt,
            lastError:
              terminalStatus === 'timeout'
                ? 'Worker heartbeat went stale after the timeout window'
                : terminalStatus === 'killed'
                  ? 'Run was canceled while stale'
                  : 'Worker heartbeat went stale',
          },
        }),
        AIRunnerRun.findByIdAndUpdate(job.runId, {
          $set: {
            status: terminalStatus,
            jobStatus: jobStatus,
            finishedAt,
            durationSeconds,
            heartbeatAt: finishedAt,
            pid: undefined,
            attemptCount: job.attemptCount,
            maxAttempts: job.maxAttempts,
            lastError:
              terminalStatus === 'timeout'
                ? 'Run timed out while the worker heartbeat was stale'
                : terminalStatus === 'killed'
                  ? 'Run was canceled'
                  : 'Worker heartbeat went stale',
          },
        }),
      ]);

      if (run?.scheduleId) {
        await AIRunnerSchedule.findByIdAndUpdate(run.scheduleId, {
          lastRunId: run._id,
          lastRunStatus: terminalStatus,
          lastRunAt: finishedAt,
        });
      }
    }
  }

  private async enqueueDueSchedules(): Promise<void> {
    const now = new Date();
    const schedules = await AIRunnerSchedule.find({
      enabled: true,
      nextRunTime: { $lte: now },
    }).sort({ nextRunTime: 1 });

    for (const schedule of schedules) {
      let cursor = schedule.nextRunTime;
      let catchupCount = 0;

      while (cursor && cursor <= now && catchupCount < MAX_SCHEDULE_CATCHUP_RUNS) {
        try {
          await enqueueRunRequest(
            {
              promptId: stringifyId(schedule.promptId),
              scheduleId: stringifyId(schedule._id),
              triggeredBy: 'schedule',
            },
            {
              scheduledFor: cursor,
              requestedAt: cursor,
            }
          );
          schedule.lastRunAt = now;
          schedule.lastRunStatus = 'queued';
          schedule.lastScheduledFor = cursor;
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code?: number }).code === 11000
          ) {
            log.warn(
              `Skipped duplicate AI Runner schedule enqueue for ${stringifyId(schedule._id)}`
            );
          } else {
            throw error;
          }
        }

        const next = getNextRunTimeFromExpression(
          schedule.cronExpression,
          new Date(cursor.getTime() + 60_000)
        );
        cursor = next ? new Date(next) : undefined;
        catchupCount += 1;
      }

      schedule.nextRunTime = cursor;
      await schedule.save();
    }
  }

  private async dispatchRunnableJobs(): Promise<void> {
    let activeCount = await AIRunnerJob.countDocuments({
      status: { $in: ['dispatched', 'running'] },
    });

    while (activeCount < DEFAULT_MAX_CONCURRENT_RUNS) {
      const now = new Date();
      const job = await AIRunnerJob.findOneAndUpdate(
        {
          status: { $in: ['queued', 'retrying'] },
          $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }],
          cancelRequestedAt: { $exists: false },
        },
        {
          $set: {
            status: 'dispatched',
            dispatchedAt: now,
            heartbeatAt: now,
            workerPid: undefined,
          },
        },
        {
          sort: { scheduledFor: 1, nextAttemptAt: 1, createdAt: 1 },
          new: true,
        }
      );

      if (!job) {
        break;
      }

      const workerPid = spawnAIRunnerWorker(stringifyId(job._id), this.instanceId);
      if (!workerPid) {
        const failedAt = new Date();
        await Promise.all([
          AIRunnerJob.findByIdAndUpdate(job._id, {
            $set: {
              status: 'failed',
              finishedAt: failedAt,
              lastError: 'Failed to spawn worker process',
            },
          }),
          AIRunnerRun.findByIdAndUpdate(job.runId, {
            $set: {
              status: 'failed',
              jobStatus: 'failed',
              finishedAt: failedAt,
              lastError: 'Failed to spawn worker process',
            },
          }),
        ]);
        continue;
      }

      await AIRunnerJob.findByIdAndUpdate(job._id, {
        $set: {
          workerPid,
          heartbeatAt: now,
        },
      });

      await AIRunnerRun.findByIdAndUpdate(job.runId, {
        $set: {
          jobStatus: 'dispatched',
          heartbeatAt: now,
          attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts,
        },
      });

      activeCount += 1;
    }
  }
}
