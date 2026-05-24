/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workerRunMock = vi.fn<[], Promise<void>>();

const workerCtorMock = vi.fn(function (this: { run: () => Promise<void> }) {
  this.run = workerRunMock;
});

const loggerMock = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const writeAIRunnerLogEntryMock = vi.fn();

vi.mock('@/lib/logger', () => ({
  createLogger: () => loggerMock,
}));

vi.mock('./logs', () => ({
  writeAIRunnerLogEntry: writeAIRunnerLogEntryMock,
}));

vi.mock('./worker', () => ({
  AIRunnerWorker: workerCtorMock,
}));

async function runEntrypoint(): Promise<void> {
  await import('./worker-entry');
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('ai-runner worker entrypoint', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    });
    process.exitCode = undefined;
    process.argv = ['node', 'worker-entry.ts'];
    delete process.env.AI_RUNNER_JOB_ID;
    workerRunMock.mockReset();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    delete process.env.AI_RUNNER_JOB_ID;
  });

  it('starts a worker with argv job id and logs started event', async () => {
    process.argv = ['node', 'worker-entry.ts', 'job-abc'];
    workerRunMock.mockResolvedValue();
    await runEntrypoint();

    expect(workerCtorMock).toHaveBeenCalledWith('job-abc');
    expect(workerRunMock).toHaveBeenCalledTimes(1);
    expect(writeAIRunnerLogEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'worker.entry_started',
        data: expect.objectContaining({ jobId: 'job-abc' }),
      }),
    );
  });

  it('uses AI_RUNNER_JOB_ID env when argv is missing', async () => {
    process.env.AI_RUNNER_JOB_ID = 'job-env-123';
    workerRunMock.mockResolvedValue();
    await runEntrypoint();

    expect(workerCtorMock).toHaveBeenCalledWith('job-env-123');
    expect(workerRunMock).toHaveBeenCalledTimes(1);
    expect(writeAIRunnerLogEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'worker.entry_started',
        data: expect.objectContaining({ jobId: 'job-env-123' }),
      }),
    );
  });

  it('prefers argv job id over env job id', async () => {
    process.env.AI_RUNNER_JOB_ID = 'job-env-ignored';
    process.argv = ['node', 'worker-entry.ts', 'job-argv'];
    workerRunMock.mockResolvedValue();
    await runEntrypoint();

    expect(workerCtorMock).toHaveBeenCalledWith('job-argv');
    expect(writeAIRunnerLogEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobId: 'job-argv' }),
      }),
    );
  });

  it('returns exit code 1 when no job id is provided', async () => {
    await runEntrypoint();

    expect(workerCtorMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(exitSpy).toHaveBeenCalled();
    expect(writeAIRunnerLogEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'worker.entry_crashed',
        data: expect.objectContaining({
          error: 'AI Runner worker requires a job id',
          jobId: undefined,
        }),
      }),
    );
  });

  it('logs a crash event when worker execution fails', async () => {
    process.argv = ['node', 'worker-entry.ts', 'job-failure'];
    workerRunMock.mockRejectedValue(new Error('boom'));
    await runEntrypoint();

    expect(workerCtorMock).toHaveBeenCalledWith('job-failure');
    expect(process.exitCode).toBe(1);
    expect(writeAIRunnerLogEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'worker.entry_crashed',
        data: expect.objectContaining({
          error: 'boom',
          jobId: 'job-failure',
        }),
      }),
    );
  });
});
