/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateLogger,
  mockLogError,
  mockRun,
  mockSupervisorConstructor,
  mockWriteAIRunnerLogEntry,
} = vi.hoisted(() => ({
  mockRun: vi.fn<() => Promise<void>>(),
  mockCreateLogger: vi.fn(),
  mockLogError: vi.fn(),
  mockWriteAIRunnerLogEntry: vi.fn(),
  mockSupervisorConstructor: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: mockCreateLogger,
}));

vi.mock('./logs', () => ({
  writeAIRunnerLogEntry: mockWriteAIRunnerLogEntry,
}));

vi.mock('./supervisor', () => ({
  AIRunnerSupervisor: mockSupervisorConstructor,
}));

const originalExitCode = process.exitCode;
let importCounter = 0;

async function importEntryWithSupervisor(
  runImplementation: () => Promise<void> = () => Promise.resolve()
) {
  vi.resetModules();
  mockRun.mockImplementation(runImplementation);
  mockCreateLogger.mockReturnValue({ error: mockLogError });
  mockWriteAIRunnerLogEntry.mockResolvedValue(undefined);
  mockSupervisorConstructor.mockImplementation(function MockSupervisor() {
    return { run: mockRun };
  });

  importCounter += 1;
  await import(/* @vite-ignore */ `./supervisor-entry.ts?testCase=${importCounter}`);
  await vi.waitFor(() => expect(mockRun).toHaveBeenCalledOnce());
}

describe.sequential('supervisor-entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('creates a namespaced entrypoint logger', async () => {
    await importEntryWithSupervisor();

    expect(mockCreateLogger).toHaveBeenCalledWith('ai-runner:supervisor-entry');
  });

  it('writes a startup log entry before running the supervisor', async () => {
    await importEntryWithSupervisor();

    expect(mockWriteAIRunnerLogEntry).toHaveBeenCalledWith({
      level: 'info',
      component: 'ai-runner:supervisor-entry',
      event: 'supervisor.entry_started',
      message: 'AI Runner supervisor entrypoint started',
      data: { pid: process.pid },
    });
    expect(mockWriteAIRunnerLogEntry.mock.invocationCallOrder[0]).toBeLessThan(
      mockRun.mock.invocationCallOrder[0]
    );
  });

  it('constructs and runs one supervisor instance', async () => {
    await importEntryWithSupervisor();

    expect(mockSupervisorConstructor).toHaveBeenCalledOnce();
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it('marks the process as failed when the supervisor crashes', async () => {
    const error = new Error('supervisor failed');

    await importEntryWithSupervisor(() => Promise.reject(error));
    await vi.waitFor(() => expect(process.exitCode).toBe(1));

    expect(mockLogError).toHaveBeenCalledWith('AI Runner supervisor crashed', error);
  });

  it('writes a structured crash log with the error message', async () => {
    await importEntryWithSupervisor(() => Promise.reject(new Error('disk full')));
    await vi.waitFor(() => expect(process.exitCode).toBe(1));

    expect(mockWriteAIRunnerLogEntry).toHaveBeenLastCalledWith({
      level: 'error',
      component: 'ai-runner:supervisor-entry',
      event: 'supervisor.entry_crashed',
      message: 'AI Runner supervisor entrypoint crashed',
      data: { error: 'disk full' },
    });
  });

  it('stringifies non-error crash reasons in the structured log', async () => {
    await importEntryWithSupervisor(() => Promise.reject('signal lost'));
    await vi.waitFor(() => expect(process.exitCode).toBe(1));

    expect(mockWriteAIRunnerLogEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { error: 'signal lost' },
      })
    );
  });
});
