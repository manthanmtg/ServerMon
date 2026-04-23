import { randomUUID } from 'node:crypto';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import AIRunnerJob from '@/models/AIRunnerJob';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule from '@/models/AIRunnerSchedule';
import AIRunnerSupervisorLease from '@/models/AIRunnerSupervisorLease';
import type { AIRunnerRunStatus } from '@/modules/ai-runner/types';
import { terminateAIRunnerExecution } from './execution';
import { writeAIRunnerLogEntry } from './logs';
import { spawnAIRunnerWorker } from './processes';
import { enqueueRunRequest } from './queue';
import { getAIRunnerSettings } from './settings';
import {
  DEFAULT_HEARTBEAT_STALE_MS,
  DEFAULT_LEASE_TTL_MS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_SUPERVISOR_TICK_MS,
  LEASE_ID,
  MAX_SCHEDULE_CATCHUP_RUNS,
  getMaxConcurrentRuns,
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
  private readonly maxConcurrentRuns = getMaxConcurrentRuns();

  async run(): Promise<void> {
    await connectDB();
    await writeAIRunnerLogEntry({
      level: 'info',
      component: 'ai-runner:supervisor',
      event: 'supervisor.loop_started',
      message: 'AI Runner supervisor loop started',
      data: {
        instanceId: this.instanceId,
        maxConcurrentRuns: this.maxConcurrentRuns,
        tickMs: this.tickMs,
      },
    });

    while (true) {
      const hasLease = await this.acquireLease();
      if (!hasLease) {
        return;
      }

      try {
        await this.tick();
      } catch (error) {
        log.error('Supervisor tick failed', error);
        await writeAIRunnerLogEntry({
          level: 'error',
          component: 'ai-runner:supervisor',
          event: 'supervisor.tick_failed',
          message: 'AI Runner supervisor tick failed',
          data: {
            instanceId: this.instanceId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
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
      terminateAIRunnerExecution({
        pid: job.childPid ?? job.workerPid,
        unitName: job.executionUnit,
      });
      const run = await AIRunnerRun.findById(job.runId);
      const timedOut =
        job.startedAt != null && Date.now() > job.startedAt.getTime() + job.timeoutMinutes * 60_000;
      const cancelled = job.cancelRequestedAt != null;
      const retryable = !cancelled && !timedOut && shouldRetryJob(job);

      await writeAIRunnerLogEntry({
        level: retryable ? 'warn' : 'error',
        component: 'ai-runner:supervisor',
        event: 'job.stale_detected',
        message: 'Detected stale AI Runner job heartbeat',
        data: {
          jobId: stringifyId(job._id),
          runId: stringifyId(job.runId),
          status: job.status,
          heartbeatAt: job.heartbeatAt?.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          timedOut,
          cancelled,
          retryable,
        },
      });

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
              executionUnit: undefined,
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
        await writeAIRunnerLogEntry({
          level: 'warn',
          component: 'ai-runner:supervisor',
          event: 'job.retry_queued',
          message: 'Queued retry for stale AI Runner job',
          data: {
            jobId: stringifyId(job._id),
            runId: stringifyId(job.runId),
            nextAttemptAt: nextAttemptAt.toISOString(),
          },
        });
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
            executionUnit: undefined,
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

      await writeAIRunnerLogEntry({
        level: 'error',
        component: 'ai-runner:supervisor',
        event: 'job.stale_finalized',
        message: 'Finalized stale AI Runner job after heartbeat loss',
        data: {
          jobId: stringifyId(job._id),
          runId: stringifyId(job.runId),
          terminalStatus,
          finishedAt: finishedAt.toISOString(),
        },
      });
    }
  }

  private async enqueueDueSchedules(): Promise<void> {
    const now = new Date();
    const schedules = await AIRunnerSchedule.find({
      enabled: true,
      nextRunTime: { $lte: now },
    }).sort({ nextRunTime: 1 });

    const settings = await getAIRunnerSettings();
    if (!settings.schedulesGloballyEnabled) {
      if (schedules.length > 0) {
        await writeAIRunnerLogEntry({
          level: 'info',
          component: 'ai-runner:supervisor',
          event: 'schedule.catchup_advanced_while_paused',
          message: 'Advanced overdue schedules while global auto-queue was disabled',
          data: {
            count: schedules.length,
          },
        });
      }

      for (const schedule of schedules) {
        let cursor = schedule.nextRunTime;
        let catchupCount = 0;

        while (cursor && cursor <= now && catchupCount < MAX_SCHEDULE_CATCHUP_RUNS) {
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
      return;
    }

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
          await writeAIRunnerLogEntry({
            level: 'info',
            component: 'ai-runner:supervisor',
            event: 'schedule.run_enqueued',
            message: 'Enqueued due AI Runner schedule',
            data: {
              scheduleId: stringifyId(schedule._id),
              promptId: stringifyId(schedule.promptId),
              scheduledFor: cursor.toISOString(),
              observedAt: now.toISOString(),
              catchupCount,
            },
          });
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
            await writeAIRunnerLogEntry({
              level: 'warn',
              component: 'ai-runner:supervisor',
              event: 'schedule.duplicate_enqueue_skipped',
              message: 'Skipped duplicate AI Runner schedule enqueue',
              data: {
                scheduleId: stringifyId(schedule._id),
                scheduledFor: cursor.toISOString(),
              },
            });
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

    while (activeCount < this.maxConcurrentRuns) {
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
            executionUnit: undefined,
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

      await writeAIRunnerLogEntry({
        level: 'info',
        component: 'ai-runner:supervisor',
        event: 'job.dispatched',
        message: 'Dispatched AI Runner job to worker',
        data: {
          jobId: stringifyId(job._id),
          runId: stringifyId(job.runId),
          scheduleId: job.scheduleId ? stringifyId(job.scheduleId) : undefined,
          dispatchedAt: now.toISOString(),
          scheduledFor: job.scheduledFor?.toISOString(),
          queueDelayMs: job.scheduledFor ? now.getTime() - job.scheduledFor.getTime() : undefined,
        },
      });

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
          dispatchedAt: now,
          heartbeatAt: now,
          attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts,
        },
      });

      activeCount += 1;
    }
  }
}
