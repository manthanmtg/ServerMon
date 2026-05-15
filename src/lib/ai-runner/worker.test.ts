/** @vitest-environment node */
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import connectDB from '@/lib/db';
import AIRunnerJob from '@/models/AIRunnerJob';
import AIRunnerRun from '@/models/AIRunnerRun';
import AIRunnerSchedule from '@/models/AIRunnerSchedule';
import { getProcessResourceUsage } from '@/lib/ai-agents/process-utils';
import {
  readAIRunnerExit,
  tailAIRunnerArtifactOutput,
  writeAIRunnerMetadata,
} from './artifact-store';
import {
  resolveAIRunnerExecutionPid,
  spawnDurableAIRunnerCommand,
  terminateAIRunnerExecution,
} from './execution';
import { writeAIRunnerLogEntry } from './logs';
import { getAIRunnerSettings } from './settings';
import { AIRunnerWorker } from './worker';

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@/lib/ai-agents/process-utils', () => ({
  getProcessResourceUsage: vi.fn().mockResolvedValue({
    cpuPercent: 0,
    memoryBytes: 0,
    memoryPercent: 0,
  }),
}));

vi.mock('@/models/AIRunnerJob', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('@/models/AIRunnerRun', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock('@/models/AIRunnerSchedule', () => ({
  default: {
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('./artifact-store', () => ({
  readAIRunnerExit: vi.fn().mockResolvedValue(null),
  resolveAIRunnerArtifactPaths: vi.fn(() => ({
    artifactDir: '/tmp/servermon-ai-runner/run-1',
    metadataPath: '/tmp/servermon-ai-runner/run-1/metadata.json',
    stdoutPath: '/tmp/servermon-ai-runner/run-1/stdout.log',
    stderrPath: '/tmp/servermon-ai-runner/run-1/stderr.log',
    combinedPath: '/tmp/servermon-ai-runner/run-1/output.log',
    exitPath: '/tmp/servermon-ai-runner/run-1/exit.json',
    wrapperLogPath: '/tmp/servermon-ai-runner/run-1/wrapper.log',
  })),
  tailAIRunnerArtifactOutput: vi.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    rawOutput: '',
    truncatedStdout: false,
    truncatedStderr: false,
    truncatedRaw: false,
  }),
  writeAIRunnerMetadata: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./execution', () => ({
  resolveAIRunnerExecutionPid: vi.fn().mockResolvedValue(null),
  spawnDurableAIRunnerCommand: vi.fn(),
  terminateAIRunnerExecution: vi.fn().mockReturnValue(true),
}));

vi.mock('./logs', () => ({
  writeAIRunnerLogEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./settings', () => ({
  getAIRunnerSettings: vi.fn().mockResolvedValue({
    artifactBaseDir: '/tmp/servermon-ai-runner',
  }),
}));

interface MockJob {
  _id: string;
  runId: string;
  createdAt: Date;
  scheduledFor: Date;
  dispatchedAt: Date;
  startedAt?: Date;
  lastOutputAt: Date;
  attemptCount: number;
  maxAttempts: number;
  timeoutMinutes: number;
  env: Record<string, string>;
  promptContent: string;
  workingDirectory: string;
  command: string;
  shell: string;
  requiresTTY: boolean;
  runAsUser?: string;
  runAsUserAuthMode?: string;
  promptId?: string;
  scheduleId?: string;
  autoflowId?: string;
  autoflowItemId?: string;
  agentProfileId: string;
  workspaceId?: string;
  cancelRequestedAt?: Date | null;
}

interface MockRun {
  _id: string;
  status: string;
  jobStatus: string;
  queuedAt?: Date;
  scheduledFor?: Date;
  dispatchedAt?: Date;
  startedAt?: Date;
  heartbeatAt?: Date;
  lastOutputAt?: Date;
  attemptCount?: number;
  maxAttempts?: number;
  save: ReturnType<typeof vi.fn>;
}

function createJob(overrides: Partial<MockJob> = {}): MockJob {
  const now = new Date('2026-05-15T01:00:00Z');

  return {
    _id: 'job-1',
    runId: 'run-1',
    createdAt: now,
    scheduledFor: now,
    dispatchedAt: now,
    lastOutputAt: now,
    attemptCount: 1,
    maxAttempts: 1,
    timeoutMinutes: 5,
    env: { EXISTING_ENV: '1' },
    promptContent: 'Run the prompt',
    workingDirectory: '/repo',
    command: 'echo ok',
    shell: '/bin/bash',
    requiresTTY: false,
    agentProfileId: 'profile-1',
    ...overrides,
  };
}

function createRun(overrides: Partial<MockRun> = {}): MockRun {
  return {
    _id: 'run-1',
    status: 'queued',
    jobStatus: 'dispatched',
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const mockSettings = {
  schedulesGloballyEnabled: true,
  autoflowMode: 'sequential' as const,
  artifactBaseDir: '/tmp/servermon-ai-runner',
  maxConcurrentRuns: 2,
  mongoRetentionDays: 30,
  artifactRetentionDays: 90,
  defaultArtifactBaseDir: '/tmp/servermon-ai-runner',
  defaultMaxConcurrentRuns: 2,
  defaultMongoRetentionDays: 30,
  defaultArtifactRetentionDays: 90,
};

function createChild(exitCode: number, pid = 4321): ChildProcess {
  const child = new EventEmitter() as EventEmitter & { pid: number };
  const originalOn = child.on.bind(child);
  child.pid = pid;
  child.on = ((eventName, listener) => {
    const result = originalOn(eventName, listener);
    if (eventName === 'close') {
      queueMicrotask(() => {
        child.emit('close', exitCode);
      });
    }
    return result;
  }) as typeof child.on;
  return child as unknown as ChildProcess;
}

describe('AIRunnerWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T01:00:00Z'));
    vi.clearAllMocks();
    vi.mocked(connectDB).mockResolvedValue(
      undefined as unknown as Awaited<ReturnType<typeof connectDB>>
    );
    vi.mocked(AIRunnerJob.findByIdAndUpdate).mockResolvedValue(null);
    vi.mocked(AIRunnerRun.findByIdAndUpdate).mockResolvedValue(null);
    vi.mocked(AIRunnerRun.findOneAndUpdate).mockResolvedValue(null);
    vi.mocked(AIRunnerSchedule.findByIdAndUpdate).mockResolvedValue(null);
    vi.mocked(readAIRunnerExit).mockResolvedValue(null);
    vi.mocked(tailAIRunnerArtifactOutput).mockResolvedValue({
      stdout: '',
      stderr: '',
      rawOutput: '',
      truncatedStdout: false,
      truncatedStderr: false,
      truncatedRaw: false,
    });
    vi.mocked(writeAIRunnerMetadata).mockResolvedValue(undefined);
    vi.mocked(resolveAIRunnerExecutionPid).mockResolvedValue(undefined);
    vi.mocked(terminateAIRunnerExecution).mockReturnValue(true);
    vi.mocked(writeAIRunnerLogEntry).mockResolvedValue(undefined);
    vi.mocked(getAIRunnerSettings).mockResolvedValue(mockSettings);
    vi.mocked(getProcessResourceUsage).mockResolvedValue({
      cpuPercent: 0,
      memoryBytes: 0,
      memoryPercent: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs and exits when no dispatched job is available', async () => {
    vi.mocked(AIRunnerJob.findOneAndUpdate).mockResolvedValue(null);

    await new AIRunnerWorker('job-1').run();

    expect(connectDB).toHaveBeenCalledOnce();
    expect(AIRunnerJob.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'job-1', status: 'dispatched' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'running', workerPid: process.pid }),
        $inc: { attemptCount: 1 },
      }),
      { new: true }
    );
    expect(AIRunnerRun.findById).not.toHaveBeenCalled();
    expect(writeAIRunnerLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warn',
        event: 'worker.start_skipped',
        data: { jobId: 'job-1' },
      })
    );
  });

  it('marks the job failed when the run document is missing', async () => {
    const job = createJob();
    vi.mocked(AIRunnerJob.findOneAndUpdate).mockResolvedValue(job);
    vi.mocked(AIRunnerRun.findById).mockResolvedValue(null);

    await new AIRunnerWorker('job-1').run();

    expect(AIRunnerJob.findByIdAndUpdate).toHaveBeenCalledWith('job-1', {
      $set: expect.objectContaining({
        status: 'failed',
        lastError: 'Run document not found for job',
      }),
    });
    expect(writeAIRunnerLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        event: 'worker.run_missing',
        data: expect.objectContaining({ jobId: 'job-1', runId: 'run-1' }),
      })
    );
  });

  it('persists run start state before spawning the child command', async () => {
    const job = createJob();
    const run = createRun();
    const child = createChild(0);
    vi.mocked(AIRunnerJob.findOneAndUpdate).mockResolvedValue(job);
    vi.mocked(AIRunnerRun.findById).mockResolvedValue(run);
    vi.mocked(AIRunnerJob.findById).mockResolvedValue(job);
    vi.mocked(spawnDurableAIRunnerCommand).mockResolvedValue({
      child,
      pid: 4321,
      processGroupId: 4321,
      unitName: undefined,
      launchPath: '/tmp/servermon-ai-runner/run-1/wrapper.sh',
    });

    await new AIRunnerWorker('job-1').run();

    expect(run.save).toHaveBeenCalledOnce();
    expect(run).toMatchObject({
      status: 'running',
      jobStatus: 'running',
      queuedAt: job.createdAt,
      scheduledFor: job.scheduledFor,
      dispatchedAt: job.dispatchedAt,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
    });
    expect(writeAIRunnerMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ artifactDir: '/tmp/servermon-ai-runner/run-1' }),
      expect.objectContaining({
        jobId: 'job-1',
        runId: 'run-1',
        command: 'echo ok',
        workingDirectory: '/repo',
      })
    );
  });

  it('marks successful child exits as completed', async () => {
    const job = createJob({ scheduleId: 'schedule-1' });
    const run = createRun();
    const child = createChild(0);
    vi.mocked(AIRunnerJob.findOneAndUpdate).mockResolvedValue(job);
    vi.mocked(AIRunnerRun.findById).mockResolvedValue(run);
    vi.mocked(AIRunnerJob.findById).mockResolvedValue(job);
    vi.mocked(spawnDurableAIRunnerCommand).mockResolvedValue({
      child,
      pid: 4321,
      processGroupId: 4321,
      unitName: undefined,
      launchPath: '/tmp/servermon-ai-runner/run-1/wrapper.sh',
    });

    await new AIRunnerWorker('job-1').run();

    expect(AIRunnerJob.findByIdAndUpdate).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'completed',
          exitCode: 0,
          childPid: 4321,
          executionUnit: undefined,
          lastError: undefined,
        }),
      })
    );
    expect(AIRunnerRun.findByIdAndUpdate).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'completed',
          jobStatus: 'completed',
          exitCode: 0,
          pid: 4321,
          lastError: undefined,
        }),
      })
    );
    expect(AIRunnerSchedule.findByIdAndUpdate).toHaveBeenCalledWith('schedule-1', {
      lastRunId: 'run-1',
      lastRunStatus: 'completed',
      lastRunAt: expect.any(Date),
    });
  });

  it('marks nonzero child exits as failed when retries are exhausted', async () => {
    const job = createJob({ attemptCount: 2, maxAttempts: 2 });
    const run = createRun();
    const child = createChild(1, 9876);
    vi.mocked(AIRunnerJob.findOneAndUpdate).mockResolvedValue(job);
    vi.mocked(AIRunnerRun.findById).mockResolvedValue(run);
    vi.mocked(AIRunnerJob.findById).mockResolvedValue(job);
    vi.mocked(spawnDurableAIRunnerCommand).mockResolvedValue({
      child,
      pid: 9876,
      processGroupId: 9876,
      unitName: undefined,
      launchPath: '/tmp/servermon-ai-runner/run-1/wrapper.sh',
    });

    await new AIRunnerWorker('job-1').run();

    expect(AIRunnerJob.findByIdAndUpdate).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          exitCode: 1,
          lastError: 'Run failed',
        }),
      })
    );
    expect(AIRunnerRun.findByIdAndUpdate).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          jobStatus: 'failed',
          exitCode: 1,
          lastError: 'Run failed',
        }),
      })
    );
  });
});
