import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getProcessResourceUsage } from '@/lib/ai-agents/process-utils';
import AIRunnerJob from '@/models/AIRunnerJob';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule from '@/models/AIRunnerSchedule';
import type { AIRunnerRunStatus } from '@/modules/ai-runner/types';
import {
  resolveAIRunnerExecutionPid,
  spawnAIRunnerCommand,
  terminateAIRunnerExecution,
} from './execution';
import {
  DEFAULT_HEARTBEAT_STALE_MS,
  DEFAULT_OUTPUT_LIMIT,
  DEFAULT_RETRY_DELAY_MS,
  applyOutputChunk,
  createEmptyBuffers,
  shouldRetryJob,
  stringifyId,
} from './shared';
import { writeAIRunnerLogEntry } from './logs';

const log = createLogger('ai-runner:worker');

type KillReason = 'timeout' | 'user' | null;

interface WorkerState {
  buffers: ReturnType<typeof createEmptyBuffers>;
  childPid: number;
  childExitSeen: boolean;
  dirty: boolean;
  executionUnit?: string;
  killedBy: KillReason;
  peakCpuPercent: number;
  peakMemoryBytes: number;
  peakMemoryPercent: number;
  runId: string;
  startedAtMs: number;
}

export class AIRunnerWorker {
  constructor(private readonly jobId: string) {}

  async run(): Promise<void> {
    await connectDB();

    const now = new Date();
    const job = await AIRunnerJob.findOneAndUpdate(
      { _id: this.jobId, status: 'dispatched' },
      {
        $set: {
          status: 'running',
          startedAt: now,
          heartbeatAt: now,
          lastOutputAt: now,
          workerPid: process.pid,
        },
        $inc: { attemptCount: 1 },
      },
      { new: true }
    );

    if (!job) {
      await writeAIRunnerLogEntry({
        level: 'warn',
        component: 'ai-runner:worker',
        event: 'worker.start_skipped',
        message: 'Worker started but no dispatched job was available',
        data: {
          jobId: this.jobId,
        },
      });
      return;
    }

    const run = await AIRunnerRun.findById(job.runId);
    if (!run) {
      await AIRunnerJob.findByIdAndUpdate(job._id, {
        $set: {
          status: 'failed',
          finishedAt: new Date(),
          lastError: 'Run document not found for job',
        },
      });
      await writeAIRunnerLogEntry({
        level: 'error',
        component: 'ai-runner:worker',
        event: 'worker.run_missing',
        message: 'Worker could not find run document for job',
        data: {
          jobId: stringifyId(job._id),
          runId: stringifyId(job.runId),
        },
      });
      return;
    }

    run.status = 'running';
    run.jobStatus = 'running';
    run.queuedAt = run.queuedAt ?? job.createdAt;
    run.scheduledFor = run.scheduledFor ?? job.scheduledFor;
    run.dispatchedAt = run.dispatchedAt ?? job.dispatchedAt;
    run.startedAt = now;
    run.heartbeatAt = now;
    run.lastOutputAt = now;
    run.attemptCount = job.attemptCount;
    run.maxAttempts = job.maxAttempts;
    await run.save();

    await writeAIRunnerLogEntry({
      level: 'info',
      component: 'ai-runner:worker',
      event: 'job.started',
      message: 'Worker began executing AI Runner job',
      data: {
        jobId: stringifyId(job._id),
        runId: stringifyId(run._id),
        attemptCount: job.attemptCount,
        scheduledFor: job.scheduledFor?.toISOString(),
        startedAt: now.toISOString(),
      },
    });

    const state: WorkerState = {
      buffers: createEmptyBuffers(),
      childPid: 0,
      childExitSeen: false,
      dirty: false,
      executionUnit: undefined,
      killedBy: null,
      peakCpuPercent: 0,
      peakMemoryBytes: 0,
      peakMemoryPercent: 0,
      runId: stringifyId(run._id),
      startedAtMs: now.getTime(),
    };

    let terminateChild = () => false;
    let completeRun: (() => void) | null = null;
    const completionPromise = new Promise<void>((resolve) => {
      completeRun = resolve;
    });
    const markDirty = () => {
      state.dirty = true;
    };
    let childPidLookupPromise: Promise<void> | null = null;

    const flush = async (force = false) => {
      const heartbeatAt = new Date();
      const updateRun: Record<string, unknown> = {
        heartbeatAt,
        lastOutputAt: state.dirty || force ? heartbeatAt : run.lastOutputAt,
        pid: state.childPid || run.pid,
        stdout: state.buffers.stdout,
        stderr: state.buffers.stderr,
        rawOutput: state.buffers.rawOutput,
        resourceUsage: {
          peakCpuPercent: state.peakCpuPercent,
          peakMemoryBytes: state.peakMemoryBytes,
          peakMemoryPercent: state.peakMemoryPercent,
        },
      };
      const updateJob: Record<string, unknown> = {
        heartbeatAt,
        lastOutputAt: state.dirty || force ? heartbeatAt : job.lastOutputAt,
        childPid: state.childPid || job.childPid,
        executionUnit: state.executionUnit ?? job.executionUnit,
      };

      await Promise.all([
        AIRunnerRun.findByIdAndUpdate(run._id, { $set: updateRun }),
        AIRunnerJob.findByIdAndUpdate(job._id, { $set: updateJob }),
      ]);
      state.dirty = false;
    };

    const persistExecutionRef = async () => {
      await Promise.all([
        AIRunnerJob.findOneAndUpdate(
          {
            _id: job._id,
            status: 'running',
            finishedAt: { $exists: false },
          },
          {
            $set: {
              childPid: state.childPid || undefined,
              executionUnit: state.executionUnit,
            },
          }
        ),
        AIRunnerRun.findOneAndUpdate(
          {
            _id: run._id,
            status: 'running',
            finishedAt: { $exists: false },
          },
          {
            $set: {
              pid: state.childPid || undefined,
            },
          }
        ),
      ]);
    };

    const resolveChildPid = async () => {
      if (state.childPid || !state.executionUnit) {
        return;
      }

      if (!childPidLookupPromise) {
        childPidLookupPromise = resolveAIRunnerExecutionPid({
          unitName: state.executionUnit,
        })
          .then(async (pid) => {
            if (!pid || state.childExitSeen) {
              return;
            }

            state.childPid = pid;
            await persistExecutionRef();
          })
          .catch((error) => {
            log.warn(`Failed to resolve worker child pid for job ${this.jobId}`, error);
            void writeAIRunnerLogEntry({
              level: 'warn',
              component: 'ai-runner:worker',
              event: 'worker.child_pid_resolution_failed',
              message: 'Failed to resolve child process id for running worker',
              data: {
                jobId: this.jobId,
                executionUnit: state.executionUnit,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          })
          .finally(() => {
            childPidLookupPromise = null;
          });
      }

      await childPidLookupPromise;
    };

    const heartbeatHandle = setInterval(
      () => {
        void (async () => {
          try {
            const currentJob = await AIRunnerJob.findById(job._id).select('cancelRequestedAt');
            if (currentJob?.cancelRequestedAt && state.killedBy !== 'user') {
              state.killedBy = 'user';
              terminateChild();
              return;
            }

            if (!state.childPid && state.executionUnit) {
              await resolveChildPid();
            }

            if (state.childPid) {
              const usage = await getProcessResourceUsage(state.childPid);
              state.peakCpuPercent = Math.max(state.peakCpuPercent, usage.cpuPercent);
              state.peakMemoryBytes = Math.max(state.peakMemoryBytes, usage.memoryBytes);
              state.peakMemoryPercent = Math.max(state.peakMemoryPercent, usage.memoryPercent);
            }

            await flush();
          } catch (error) {
            log.warn(`Failed worker heartbeat for job ${this.jobId}`, error);
            void writeAIRunnerLogEntry({
              level: 'warn',
              component: 'ai-runner:worker',
              event: 'worker.heartbeat_failed',
              message: 'Worker heartbeat flush failed',
              data: {
                jobId: this.jobId,
                runId: state.runId,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
        })();
      },
      Math.max(5_000, Math.floor(DEFAULT_HEARTBEAT_STALE_MS / 2))
    );

    const timeoutHandle = setTimeout(() => {
      state.killedBy = 'timeout';
      terminateChild();
    }, job.timeoutMinutes * 60_000);

    const finalize = async (exitCode: number | null, fallbackStatus: AIRunnerRunStatus) => {
      if (state.childExitSeen) {
        return;
      }

      state.childExitSeen = true;
      clearInterval(heartbeatHandle);
      clearTimeout(timeoutHandle);
      await flush(true).catch((error) => {
        log.warn(`Failed to flush final worker output for job ${this.jobId}`, error);
        void writeAIRunnerLogEntry({
          level: 'warn',
          component: 'ai-runner:worker',
          event: 'worker.final_flush_failed',
          message: 'Failed to flush final worker output',
          data: {
            jobId: this.jobId,
            runId: state.runId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      });

      const finishedAt = new Date();
      const durationSeconds = Math.max(0, Math.round((Date.now() - state.startedAtMs) / 1000));
      const latestJob = await AIRunnerJob.findById(job._id);
      const canRetry = latestJob ? shouldRetryJob(latestJob) : false;

      let terminalRunStatus: AIRunnerRunStatus = fallbackStatus;
      if (state.killedBy === 'timeout') terminalRunStatus = 'timeout';
      if (state.killedBy === 'user') terminalRunStatus = 'killed';

      if (
        terminalRunStatus !== 'completed' &&
        terminalRunStatus !== 'killed' &&
        canRetry &&
        latestJob?.cancelRequestedAt == null
      ) {
        const nextAttemptAt = new Date(Date.now() + DEFAULT_RETRY_DELAY_MS);
        await Promise.all([
          AIRunnerJob.findByIdAndUpdate(job._id, {
            $set: {
              status: 'retrying',
              nextAttemptAt,
              heartbeatAt: undefined,
              childPid: undefined,
              executionUnit: undefined,
              exitCode: typeof exitCode === 'number' ? exitCode : undefined,
              lastError:
                terminalRunStatus === 'timeout'
                  ? 'Run timed out and will be retried'
                  : `Run failed on attempt ${latestJob?.attemptCount ?? job.attemptCount}`,
            },
          }),
          AIRunnerRun.findByIdAndUpdate(run._id, {
            $set: {
              status: 'retrying',
              jobStatus: 'retrying',
              attemptCount: latestJob?.attemptCount ?? job.attemptCount,
              maxAttempts: latestJob?.maxAttempts ?? job.maxAttempts,
              heartbeatAt: undefined,
              pid: undefined,
              lastError:
                terminalRunStatus === 'timeout'
                  ? 'Run timed out and was queued for retry'
                  : 'Run failed and was queued for retry',
            },
            $unset: {
              finishedAt: '',
              durationSeconds: '',
            },
          }),
        ]);

        if (job.scheduleId) {
          await AIRunnerSchedule.findByIdAndUpdate(job.scheduleId, {
            lastRunId: run._id,
            lastRunStatus: 'retrying',
            lastRunAt: finishedAt,
          });
        }

        await writeAIRunnerLogEntry({
          level: 'warn',
          component: 'ai-runner:worker',
          event: 'job.retry_scheduled',
          message: 'Scheduled AI Runner job retry after unsuccessful attempt',
          data: {
            jobId: stringifyId(job._id),
            runId: stringifyId(run._id),
            terminalRunStatus,
            nextAttemptAt: nextAttemptAt.toISOString(),
            exitCode: typeof exitCode === 'number' ? exitCode : undefined,
          },
        });

        completeRun?.();
        return;
      }

      const finalJobStatus =
        terminalRunStatus === 'completed'
          ? 'completed'
          : terminalRunStatus === 'killed'
            ? 'canceled'
            : 'failed';

      await Promise.all([
        AIRunnerJob.findByIdAndUpdate(job._id, {
          $set: {
            status: finalJobStatus,
            finishedAt,
            heartbeatAt: finishedAt,
            lastOutputAt: finishedAt,
            exitCode: typeof exitCode === 'number' ? exitCode : undefined,
            childPid: state.childPid || undefined,
            executionUnit: undefined,
            lastError:
              terminalRunStatus === 'completed'
                ? undefined
                : terminalRunStatus === 'timeout'
                  ? 'Run timed out'
                  : terminalRunStatus === 'killed'
                    ? 'Run was canceled'
                    : 'Run failed',
          },
        }),
        AIRunnerRun.findByIdAndUpdate(run._id, {
          $set: {
            status: terminalRunStatus,
            jobStatus: finalJobStatus,
            exitCode: typeof exitCode === 'number' ? exitCode : undefined,
            finishedAt,
            durationSeconds,
            heartbeatAt: finishedAt,
            lastOutputAt: finishedAt,
            pid: state.childPid || undefined,
            attemptCount: latestJob?.attemptCount ?? job.attemptCount,
            maxAttempts: latestJob?.maxAttempts ?? job.maxAttempts,
            lastError:
              terminalRunStatus === 'completed'
                ? undefined
                : terminalRunStatus === 'timeout'
                  ? 'Run timed out'
                  : terminalRunStatus === 'killed'
                    ? 'Run was canceled'
                    : 'Run failed',
            resourceUsage: {
              peakCpuPercent: state.peakCpuPercent,
              peakMemoryBytes: state.peakMemoryBytes,
              peakMemoryPercent: state.peakMemoryPercent,
            },
          },
        }),
      ]);

      if (job.scheduleId) {
        await AIRunnerSchedule.findByIdAndUpdate(job.scheduleId, {
          lastRunId: run._id,
          lastRunStatus: terminalRunStatus,
          lastRunAt: finishedAt,
        });
      }

      await writeAIRunnerLogEntry({
        level: terminalRunStatus === 'completed' ? 'info' : 'warn',
        component: 'ai-runner:worker',
        event: 'job.finished',
        message: 'Finished AI Runner job execution',
        data: {
          jobId: stringifyId(job._id),
          runId: stringifyId(run._id),
          terminalRunStatus,
          finalJobStatus,
          exitCode: typeof exitCode === 'number' ? exitCode : undefined,
          finishedAt: finishedAt.toISOString(),
          durationSeconds,
          killedBy: state.killedBy,
        },
      });

      completeRun?.();
    };

    const applyChunk = (kind: 'stdout' | 'stderr', text: string) => {
      state.buffers = applyOutputChunk(state.buffers, kind, text, DEFAULT_OUTPUT_LIMIT);
      markDirty();
    };

    const runEnv = {
      ...process.env,
      ...(job.env instanceof Map ? Object.fromEntries(job.env.entries()) : job.env),
      PROMPT: job.promptContent,
      WORKING_DIR: job.workingDirectory,
    };

    try {
      const childExecution = await spawnAIRunnerCommand({
        jobId: this.jobId,
        shell: job.shell,
        command: job.command,
        cwd: job.workingDirectory,
        env: runEnv,
        requiresTTY: job.requiresTTY,
      });
      const child = childExecution.child;

      state.childPid =
        childExecution.unitName && childExecution.pid == null
          ? 0
          : childExecution.pid ?? child.pid ?? 0;
      state.executionUnit = childExecution.unitName;
      terminateChild = () =>
        terminateAIRunnerExecution({
          pid: state.childPid || undefined,
          unitName: state.executionUnit,
        });

      await writeAIRunnerLogEntry({
        level: 'info',
        component: 'ai-runner:worker',
        event: 'worker.child_spawned',
        message: 'Spawned AI Runner child command',
        data: {
          jobId: this.jobId,
          runId: state.runId,
          pid: state.childPid || undefined,
          executionUnit: state.executionUnit,
          requiresTTY: job.requiresTTY,
          shell: job.shell,
        },
      });

      child.stdout?.on('data', (chunk: Buffer | string) => {
        applyChunk('stdout', chunk.toString());
      });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        applyChunk('stderr', chunk.toString());
      });

      child.on('error', (error) => {
        log.error(`Worker child errored for job ${this.jobId}`, error);
        void writeAIRunnerLogEntry({
          level: 'error',
          component: 'ai-runner:worker',
          event: 'worker.child_error',
          message: 'AI Runner child process emitted an error',
          data: {
            jobId: this.jobId,
            runId: state.runId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        void finalize(null, 'failed');
      });

      child.on('close', (exitCode) => {
        void writeAIRunnerLogEntry({
          level: exitCode === 0 ? 'info' : 'warn',
          component: 'ai-runner:worker',
          event: 'worker.child_closed',
          message: 'AI Runner child process closed',
          data: {
            jobId: this.jobId,
            runId: state.runId,
            exitCode,
          },
        });
        void finalize(exitCode, exitCode === 0 ? 'completed' : 'failed');
      });

      await persistExecutionRef();
      void resolveChildPid();
    } catch (error) {
      clearInterval(heartbeatHandle);
      clearTimeout(timeoutHandle);
      await Promise.all([
        AIRunnerJob.findByIdAndUpdate(job._id, {
          $set: {
            status: 'failed',
            finishedAt: new Date(),
            lastError: error instanceof Error ? error.message : 'Failed to start worker child',
          },
        }),
        AIRunnerRun.findByIdAndUpdate(run._id, {
          $set: {
            status: 'failed',
            jobStatus: 'failed',
            finishedAt: new Date(),
            lastError: error instanceof Error ? error.message : 'Failed to start worker child',
          },
        }),
      ]);
      await writeAIRunnerLogEntry({
        level: 'error',
        component: 'ai-runner:worker',
        event: 'worker.start_failed',
        message: 'Failed to start AI Runner child command',
        data: {
          jobId: this.jobId,
          runId: state.runId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }

    await completionPromise;
  }
}
