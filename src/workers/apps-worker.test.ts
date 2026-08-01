/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppsWorkerRunnerHandle } from '@/lib/apps/worker/runner';
import { runAppsWorkerProcess } from './apps-worker';

const { mockConnectDB, mockUpsertHeartbeat, mockMarkStopped, mockLogError, mockLogInfo } =
  vi.hoisted(() => ({
    mockConnectDB: vi.fn(() => new Promise<void>(() => undefined)),
    mockUpsertHeartbeat: vi.fn(),
    mockMarkStopped: vi.fn(),
    mockLogError: vi.fn(),
    mockLogInfo: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({ default: mockConnectDB }));
vi.mock('@/lib/apps/repositories/worker-heartbeat-repository', () => ({
  upsertAppsWorkerHeartbeat: mockUpsertHeartbeat,
  markAppsWorkerStopped: mockMarkStopped,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: mockLogInfo, warn: vi.fn(), error: mockLogError, debug: vi.fn() }),
}));

function createRunnerHandle(
  overrides: Partial<AppsWorkerRunnerHandle> = {}
): AppsWorkerRunnerHandle {
  return {
    stopClaiming: vi.fn(),
    drain: vi.fn().mockResolvedValue('drained'),
    getCurrentOperation: vi.fn().mockReturnValue(null),
    ...overrides,
  };
}

function baseDependencies() {
  const runner = createRunnerHandle();
  return {
    connectDB: vi.fn().mockResolvedValue(undefined),
    upsertHeartbeat: vi.fn().mockResolvedValue(undefined),
    markStopped: vi.fn().mockResolvedValue(undefined),
    startRunner: vi.fn().mockReturnValue(runner),
    createWorkerId: () => 'apps-worker-test-1',
    hostname: 'test-host',
    pid: 42,
    version: '1.2.3',
    heartbeatWriteTimeoutMs: 100,
    registerSignalHandler: vi.fn(),
    exit: vi.fn(),
    runner,
  };
}

describe('runAppsWorkerProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('connects, publishes starting, starts the runner, and then publishes running', async () => {
    const dependencies = baseDependencies();

    const handle = await runAppsWorkerProcess(dependencies);

    expect(dependencies.connectDB).toHaveBeenCalledOnce();
    expect(dependencies.upsertHeartbeat).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workerId: 'apps-worker-test-1',
        status: 'starting',
        hostname: 'test-host',
        pid: 42,
        version: '1.2.3',
      })
    );
    expect(dependencies.startRunner).toHaveBeenCalledWith(
      'apps-worker-test-1',
      expect.objectContaining({ onFatal: expect.any(Function) })
    );
    expect(dependencies.upsertHeartbeat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: 'running' })
    );
    expect(dependencies.connectDB.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.upsertHeartbeat.mock.invocationCallOrder[0]
    );
    expect(dependencies.upsertHeartbeat.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.startRunner.mock.invocationCallOrder[0]
    );
    expect(dependencies.startRunner.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.upsertHeartbeat.mock.invocationCallOrder[1]
    );

    await handle.shutdown('signal');
  });

  it('logs periodic heartbeat failures and includes current operation metadata', async () => {
    vi.useFakeTimers();
    const dependencies = baseDependencies();
    vi.mocked(dependencies.runner.getCurrentOperation).mockReturnValue({
      operationId: 'op_1',
      leaseGeneration: 7,
    });
    dependencies.upsertHeartbeat
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('heartbeat store unavailable'));

    const handle = await runAppsWorkerProcess({
      ...dependencies,
      heartbeatIntervalMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(dependencies.upsertHeartbeat).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        status: 'running',
        currentOperationId: 'op_1',
        leaseGeneration: 7,
      })
    );
    expect(mockLogError).toHaveBeenCalledWith(
      'Failed to publish Apps worker heartbeat',
      expect.objectContaining({ error: 'heartbeat store unavailable' })
    );

    await handle.shutdown('signal');
    vi.useRealTimers();
  });

  it('does not overlap periodic heartbeat writes', async () => {
    vi.useFakeTimers();
    const dependencies = baseDependencies();
    let resolvePeriodicHeartbeat: (() => void) | undefined;
    const periodicHeartbeat = new Promise<void>((resolve) => {
      resolvePeriodicHeartbeat = resolve;
    });
    dependencies.upsertHeartbeat
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(periodicHeartbeat);

    const handle = await runAppsWorkerProcess({
      ...dependencies,
      heartbeatIntervalMs: 5_000,
    });
    await vi.advanceTimersByTimeAsync(15_000);

    expect(dependencies.upsertHeartbeat).toHaveBeenCalledTimes(3);

    resolvePeriodicHeartbeat?.();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(dependencies.upsertHeartbeat).toHaveBeenCalledTimes(4);

    await handle.shutdown('signal');
    vi.useRealTimers();
  });

  it('starts draining immediately and waits for an in-flight heartbeat before publishing draining', async () => {
    vi.useFakeTimers();
    const dependencies = baseDependencies();
    let resolvePeriodicHeartbeat: (() => void) | undefined;
    const periodicHeartbeat = new Promise<void>((resolve) => {
      resolvePeriodicHeartbeat = resolve;
    });
    dependencies.upsertHeartbeat
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(periodicHeartbeat);

    const handle = await runAppsWorkerProcess({
      ...dependencies,
      heartbeatIntervalMs: 5_000,
      heartbeatWriteTimeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(5_000);

    const shutdownPromise = handle.shutdown('signal');
    expect(dependencies.runner.stopClaiming).toHaveBeenCalledOnce();
    expect(dependencies.runner.drain).toHaveBeenCalledOnce();
    expect(dependencies.upsertHeartbeat).toHaveBeenCalledTimes(3);

    resolvePeriodicHeartbeat?.();
    await vi.advanceTimersByTimeAsync(0);
    await shutdownPromise;

    expect(dependencies.upsertHeartbeat).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ status: 'draining' })
    );
    expect(dependencies.markStopped).toHaveBeenCalledOnce();
    expect(dependencies.exit).toHaveBeenCalledWith(0);
    vi.useRealTimers();
  });

  it('bounds shutdown when heartbeat persistence hangs', async () => {
    vi.useFakeTimers();
    const dependencies = baseDependencies();
    dependencies.upsertHeartbeat
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => new Promise<void>(() => undefined))
      .mockImplementationOnce(() => new Promise<void>(() => undefined));
    dependencies.markStopped.mockImplementationOnce(() => new Promise<void>(() => undefined));

    const handle = await runAppsWorkerProcess({
      ...dependencies,
      heartbeatIntervalMs: 5_000,
      heartbeatWriteTimeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(5_000);

    const shutdownPromise = handle.shutdown('signal');
    await vi.advanceTimersByTimeAsync(300);
    await shutdownPromise;

    expect(dependencies.runner.drain).toHaveBeenCalledOnce();
    expect(dependencies.exit).toHaveBeenCalledWith(0);
    expect(mockLogError).toHaveBeenCalledWith(
      'Apps worker heartbeat write timed out',
      expect.objectContaining({ timeoutMs: 100 })
    );
    vi.useRealTimers();
  });

  it('coalesces repeated signals into one bounded drained shutdown', async () => {
    const dependencies = baseDependencies();
    const signalHandlers = new Map<string, () => void>();
    dependencies.registerSignalHandler.mockImplementation((signal, handler) => {
      signalHandlers.set(signal, handler);
    });

    const handle = await runAppsWorkerProcess(dependencies);
    signalHandlers.get('SIGTERM')?.();
    signalHandlers.get('SIGINT')?.();
    await handle.shutdown('signal');

    expect(dependencies.runner.stopClaiming).toHaveBeenCalledOnce();
    expect(dependencies.runner.drain).toHaveBeenCalledOnce();
    expect(dependencies.upsertHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draining' })
    );
    expect(dependencies.markStopped).toHaveBeenCalledWith('apps-worker-test-1');
    expect(dependencies.exit).toHaveBeenCalledOnce();
    expect(dependencies.exit).toHaveBeenCalledWith(0);
  });

  it('exits after a timed-out drain without falsely marking the worker stopped', async () => {
    const dependencies = baseDependencies();
    vi.mocked(dependencies.runner.drain).mockResolvedValue('timed_out');

    const handle = await runAppsWorkerProcess(dependencies);
    await handle.shutdown('signal');

    expect(dependencies.markStopped).not.toHaveBeenCalled();
    expect(dependencies.exit).toHaveBeenCalledWith(0);
    expect(mockLogError).toHaveBeenCalledWith(
      'Apps worker drain timed out',
      expect.objectContaining({ workerId: 'apps-worker-test-1' })
    );
  });

  it('marks the heartbeat failed and exits non-zero after fatal lease loss', async () => {
    const dependencies = baseDependencies();
    let onFatal: ((error: Error) => void) | undefined;
    dependencies.startRunner.mockImplementation((_workerId, options) => {
      onFatal = options.onFatal;
      return dependencies.runner;
    });

    const handle = await runAppsWorkerProcess(dependencies);
    onFatal?.(new Error('lease lost'));
    await handle.shutdown('fatal');

    expect(dependencies.upsertHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'lease lost' })
    );
    expect(dependencies.markStopped).not.toHaveBeenCalled();
    expect(dependencies.exit).toHaveBeenCalledWith(1);
  });

  it('exits non-zero and rejects when startup fails', async () => {
    const dependencies = baseDependencies();
    dependencies.connectDB.mockRejectedValue(new Error('Mongo unavailable'));

    await expect(runAppsWorkerProcess(dependencies)).rejects.toThrow('Mongo unavailable');

    expect(dependencies.startRunner).not.toHaveBeenCalled();
    expect(dependencies.exit).toHaveBeenCalledWith(1);
    expect(mockLogError).toHaveBeenCalledWith(
      'Apps worker failed to start',
      expect.objectContaining({ error: 'Mongo unavailable' })
    );
  });
});
