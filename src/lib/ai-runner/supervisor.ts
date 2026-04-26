import { randomUUID } from 'node:crypto';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import AIRunnerAutoflow from '@/models/AIRunnerAutoflow';
import AIRunnerJob, { type IAIRunnerJob } from '@/models/AIRunnerJob';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule from '@/models/AIRunnerSchedule';
import AIRunnerSupervisorLease from '@/models/AIRunnerSupervisorLease';
import type { AIRunnerRunStatus } from '@/modules/ai-runner/types';
import { isAIRunnerExecutionAlive, terminateAIRunnerExecution } from './execution';
import {
  cleanupAIRunnerArtifacts,
  readAIRunnerExit,
  resolveAIRunnerArtifactPaths,
} from './artifact-store';
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
  private lastRetentionCleanupAt = Number.NEGATIVE_INFINITY;

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
    await this.advanceAutoflows();
    await this.dispatchRunnableJobs();
    await this.cleanupRetainedHistory();
  }

  private async advanceAutoflows(): Promise<void> {
    const autoflows = await AIRunnerAutoflow.find({ status: 'running' }).sort({ updatedAt: 1 });

    for (const autoflow of autoflows) {
      let changed = false;

      for (const item of autoflow.items) {
        if (!item.runId || !['queued', 'running'].includes(item.status)) continue;
        const run = await AIRunnerRun.findById(item.runId);
        if (!run) continue;
        if (run.status === 'queued' || run.status === 'retrying') {
          if (item.status !== 'queued') {
            item.status = 'queued';
            changed = true;
          }
          continue;
        }
        if (run.status === 'running') {
          item.status = 'running';
          item.startedAt = run.startedAt ?? item.startedAt;
          changed = true;
          continue;
        }
        if (run.status === 'completed') {
          item.status = 'completed';
          item.finishedAt = run.finishedAt ?? new Date();
          changed = true;
          continue;
        }
        item.status = run.status === 'killed' ? 'canceled' : 'failed';
        item.lastError = run.lastError ?? `Run finished with ${run.status}`;
        item.finishedAt = run.finishedAt ?? new Date();
        changed = true;
      }

      const hasFailed = autoflow.items.some((item) => item.status === 'failed');
      if (hasFailed && !autoflow.continueOnFailure) {
        for (const item of autoflow.items) {
          if (item.status === 'pending') {
            item.status = 'skipped';
            item.finishedAt = new Date();
          }
        }
        autoflow.status = 'failed';
        autoflow.finishedAt = new Date();
        await autoflow.save();
        continue;
      }

      const activeItems = autoflow.items.filter((item) =>
        ['queued', 'running'].includes(item.status)
      );
      const pendingItems = autoflow.items.filter((item) => item.status === 'pending');

      if (pendingItems.length === 0 && activeItems.length === 0) {
        autoflow.status = hasFailed ? 'failed' : 'completed';
        autoflow.finishedAt = new Date();
        await autoflow.save();
        continue;
      }

      if (activeItems.length > 0 && autoflow.mode === 'sequential') {
        if (changed) await autoflow.save();
        continue;
      }

      const itemsToQueue = autoflow.mode === 'parallel' ? pendingItems : pendingItems.slice(0, 1);
      for (const item of itemsToQueue) {
        try {
          const run = await enqueueRunRequest(
            {
              promptId: item.promptId ? stringifyId(item.promptId) : undefined,
              content: item.promptId ? undefined : item.promptContent,
              type: item.promptType,
              agentProfileId: stringifyId(item.agentProfileId),
              workspaceId: item.workspaceId ? stringifyId(item.workspaceId) : undefined,
              workingDirectory: item.workingDirectory,
              timeout: item.timeout,
              autoflowId: stringifyId(autoflow._id),
              autoflowItemId: stringifyId(item._id),
              triggeredBy: 'autoflow',
            },
            {
              triggeredBy: 'autoflow',
            }
          );
          item.status = 'queued';
          item.runId = run._id as unknown as typeof item.runId;
          item.lastError = undefined;
          changed = true;
          await writeAIRunnerLogEntry({
            level: 'info',
            component: 'ai-runner:supervisor',
            event: 'autoflow.item_queued',
            message: 'Queued AI Runner autoflow item',
            data: {
              autoflowId: stringifyId(autoflow._id),
              itemId: stringifyId(item._id),
              runId: run._id,
              mode: autoflow.mode,
            },
          });
        } catch (error) {
          item.status = 'failed';
          item.lastError = error instanceof Error ? error.message : String(error);
          item.finishedAt = new Date();
          changed = true;
          if (!autoflow.continueOnFailure) break;
        }
      }

      const nextPendingIndex = autoflow.items.findIndex((item) => item.status === 'pending');
      autoflow.currentIndex = nextPendingIndex === -1 ? autoflow.items.length : nextPendingIndex;
      if (changed) await autoflow.save();
    }
  }

  private async isWorkspaceBlocked(
    job: Pick<IAIRunnerJob, 'workspaceId' | 'workspaceBlocking' | '_id'>
  ): Promise<boolean> {
    if (!job.workspaceBlocking || !job.workspaceId) return false;
    const activeJob = await AIRunnerJob.findOne({
      _id: { $ne: job._id },
      workspaceId: job.workspaceId,
      workspaceBlocking: true,
      status: { $in: ['dispatched', 'running'] },
      cancelRequestedAt: { $exists: false },
    }).select('_id');
    return Boolean(activeJob);
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
      const paths =
        job.artifactDir && job.stdoutPath && job.stderrPath && job.combinedPath && job.exitPath
          ? {
              artifactDir: job.artifactDir,
              metadataPath: `${job.artifactDir}/metadata.json`,
              stdoutPath: job.stdoutPath,
              stderrPath: job.stderrPath,
              combinedPath: job.combinedPath,
              exitPath: job.exitPath,
              wrapperLogPath: `${job.artifactDir}/wrapper.log`,
            }
          : run?.artifactDir
            ? resolveAIRunnerArtifactPaths(
                run.artifactDir.replace(/\/runs\/[^/]+$/, ''),
                stringifyId(run._id)
              )
            : null;
      const exit = paths ? await readAIRunnerExit(paths) : null;
      if (exit) {
        const exitCode = typeof exit.exitCode === 'number' ? exit.exitCode : 1;
        const terminalStatus: AIRunnerRunStatus = exitCode === 0 ? 'completed' : 'failed';
        const retryable = exitCode !== 0 && !cancelled && shouldRetryJob(job);
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
                recoveryState: 'exit_retry',
                lastRecoveryError: undefined,
                lastError: 'Recovered failed exit marker and queued retry',
              },
            }),
            AIRunnerRun.findByIdAndUpdate(job.runId, {
              $set: {
                status: 'retrying',
                jobStatus: 'retrying',
                exitCode,
                heartbeatAt: undefined,
                pid: undefined,
                recoveryState: 'exit_retry',
                lastRecoveryError: undefined,
                lastError: 'Recovered failed exit marker and queued retry',
              },
              $unset: {
                finishedAt: '',
                durationSeconds: '',
              },
            }),
          ]);
          continue;
        }

        const finishedAt = new Date(exit.finishedAt);
        await Promise.all([
          AIRunnerJob.findByIdAndUpdate(job._id, {
            $set: {
              status: terminalStatus === 'completed' ? 'completed' : 'failed',
              finishedAt,
              heartbeatAt: finishedAt,
              exitCode,
              executionUnit: undefined,
              recoveryState: 'exit_recovered',
              lastRecoveryError: undefined,
              lastError: terminalStatus === 'completed' ? undefined : 'Recovered non-zero exit',
            },
          }),
          AIRunnerRun.findByIdAndUpdate(job.runId, {
            $set: {
              status: terminalStatus,
              jobStatus: terminalStatus === 'completed' ? 'completed' : 'failed',
              finishedAt,
              durationSeconds: exit.durationSeconds,
              heartbeatAt: finishedAt,
              exitCode,
              recoveryState: 'exit_recovered',
              lastRecoveryError: undefined,
              lastError: terminalStatus === 'completed' ? undefined : 'Recovered non-zero exit',
            },
          }),
        ]);
        continue;
      }

      const executionAlive = isAIRunnerExecutionAlive({
        pid: job.childPid ?? job.workerPid,
        processGroupId: job.executionRef?.processGroupId,
        unitName: job.executionUnit ?? job.executionRef?.unitName,
      });

      if (executionAlive && !timedOut && !cancelled) {
        const heartbeatAt = new Date();
        await Promise.all([
          AIRunnerJob.findByIdAndUpdate(job._id, {
            $set: {
              status: 'running',
              heartbeatAt,
              recoveryState: 'observed_alive',
              lastRecoveryError: undefined,
            },
          }),
          AIRunnerRun.findByIdAndUpdate(job.runId, {
            $set: {
              status: 'running',
              jobStatus: 'running',
              heartbeatAt,
              recoveryState: 'observed_alive',
              lastRecoveryError: undefined,
            },
          }),
        ]);
        await writeAIRunnerLogEntry({
          level: 'info',
          component: 'ai-runner:supervisor',
          event: 'job.stale_recovered_alive',
          message: 'Recovered stale AI Runner job because execution is still alive',
          data: {
            jobId: stringifyId(job._id),
            runId: stringifyId(job.runId),
          },
        });
        continue;
      }

      terminateAIRunnerExecution({
        pid: job.executionRef?.processGroupId ?? job.childPid ?? job.workerPid,
        unitName: job.executionUnit ?? job.executionRef?.unitName,
      });
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
          const scheduledFor = cursor.toISOString();
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
                scheduledFor,
              },
            });
          } else {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Failed to enqueue AI Runner schedule ${stringifyId(schedule._id)}`, error);
            await writeAIRunnerLogEntry({
              level: 'error',
              component: 'ai-runner:supervisor',
              event: 'schedule.enqueue_failed',
              message: 'Failed to enqueue due AI Runner schedule',
              data: {
                scheduleId: stringifyId(schedule._id),
                scheduleName: schedule.name,
                promptId: stringifyId(schedule.promptId),
                agentProfileId: schedule.agentProfileId
                  ? stringifyId(schedule.agentProfileId)
                  : undefined,
                workingDirectory: schedule.workingDirectory,
                scheduledFor,
                observedAt: now.toISOString(),
                error: message,
              },
            });
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

  private async cleanupRetainedHistory(): Promise<void> {
    const nowMs = Date.now();
    if (nowMs - this.lastRetentionCleanupAt < 60 * 60 * 1000) {
      return;
    }
    this.lastRetentionCleanupAt = nowMs;
    const settings = await getAIRunnerSettings();
    const now = new Date();
    const activeRuns = await AIRunnerRun.find({
      status: { $in: ['queued', 'running', 'retrying'] },
    })
      .select('_id')
      .lean();
    const activeRunIds = new Set(activeRuns.map((run) => stringifyId(run._id)));
    const mongoCutoff = new Date(now.getTime() - settings.mongoRetentionDays * 24 * 60 * 60 * 1000);

    await Promise.all([
      AIRunnerJob.deleteMany({
        status: { $in: ['completed', 'failed', 'canceled'] },
        updatedAt: { $lt: mongoCutoff },
      }),
      AIRunnerRun.deleteMany({
        status: { $in: ['completed', 'failed', 'timeout', 'killed'] },
        updatedAt: { $lt: mongoCutoff },
      }),
    ]);

    const deletedArtifacts = await cleanupAIRunnerArtifacts({
      baseDir: settings.artifactBaseDir,
      retentionDays: settings.artifactRetentionDays,
      activeRunIds,
      now,
    });

    if (deletedArtifacts.length > 0) {
      await writeAIRunnerLogEntry({
        level: 'info',
        component: 'ai-runner:supervisor',
        event: 'artifacts.retention_cleanup',
        message: 'Cleaned up old AI Runner artifact folders',
        data: {
          count: deletedArtifacts.length,
        },
      });
    }
  }

  private async dispatchRunnableJobs(): Promise<void> {
    let activeCount = await AIRunnerJob.countDocuments({
      status: { $in: ['dispatched', 'running'] },
    });

    while (activeCount < this.maxConcurrentRuns) {
      const now = new Date();
      const candidates = await AIRunnerJob.find({
        status: { $in: ['queued', 'retrying'] },
        $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }],
        cancelRequestedAt: { $exists: false },
      })
        .sort({ scheduledFor: 1, nextAttemptAt: 1, createdAt: 1 })
        .limit(25);

      let selectedJob: IAIRunnerJob | null = null;
      for (const candidate of candidates) {
        if (await this.isWorkspaceBlocked(candidate)) {
          continue;
        }
        selectedJob = candidate;
        break;
      }

      if (!selectedJob) {
        break;
      }

      const job = await AIRunnerJob.findOneAndUpdate(
        {
          _id: selectedJob._id,
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
