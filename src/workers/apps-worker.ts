import 'dotenv/config';
import { hostname as getHostname } from 'os';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import {
  APPS_WORKER_DRAIN_MS,
  APPS_WORKER_HEARTBEAT_MS,
  APPS_WORKER_HEARTBEAT_WRITE_TIMEOUT_MS,
} from '@/lib/apps/config';
import {
  markAppsWorkerStopped,
  upsertAppsWorkerHeartbeat,
} from '@/lib/apps/repositories/worker-heartbeat-repository';
import { AppsWorkerRunnerHandle, startAppsWorkerRunner } from '@/lib/apps/worker/runner';

const log = createLogger('apps:worker');

type ShutdownReason = 'signal' | 'fatal';

export interface AppsWorkerProcessDependencies {
  connectDB: typeof connectDB;
  upsertHeartbeat: typeof upsertAppsWorkerHeartbeat;
  markStopped: typeof markAppsWorkerStopped;
  startRunner: typeof startAppsWorkerRunner;
  createWorkerId: () => string;
  hostname: string;
  pid: number;
  version?: string;
  heartbeatIntervalMs: number;
  heartbeatWriteTimeoutMs: number;
  drainTimeoutMs: number;
  registerSignalHandler: (signal: NodeJS.Signals, handler: () => void) => void;
  exit: (code: number) => unknown;
}

export interface AppsWorkerProcessHandle {
  workerId: string;
  shutdown(reason: ShutdownReason, error?: unknown): Promise<void>;
}

function defaultDependencies(): AppsWorkerProcessDependencies {
  const host = getHostname();
  return {
    connectDB,
    upsertHeartbeat: upsertAppsWorkerHeartbeat,
    markStopped: markAppsWorkerStopped,
    startRunner: startAppsWorkerRunner,
    createWorkerId: () => `apps-worker-${host}-${process.pid}-${Date.now()}`,
    hostname: host,
    pid: process.pid,
    version: process.env.npm_package_version,
    heartbeatIntervalMs: APPS_WORKER_HEARTBEAT_MS,
    heartbeatWriteTimeoutMs: APPS_WORKER_HEARTBEAT_WRITE_TIMEOUT_MS,
    drainTimeoutMs: APPS_WORKER_DRAIN_MS,
    registerSignalHandler: (signal, handler) => process.on(signal, handler),
    exit: (code) => process.exit(code),
  };
}

export async function runAppsWorkerProcess(
  overrides: Partial<AppsWorkerProcessDependencies> = {}
): Promise<AppsWorkerProcessHandle> {
  const dependencies = { ...defaultDependencies(), ...overrides };
  const workerId = dependencies.createWorkerId();
  let runner: AppsWorkerRunnerHandle | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatWriteInFlight: Promise<void> | null = null;
  let shutdownPromise: Promise<void> | null = null;

  const heartbeatInput = (
    status: 'starting' | 'running' | 'draining' | 'failed',
    error?: string
  ) => {
    const currentOperation = runner?.getCurrentOperation() ?? null;
    return {
      workerId,
      status,
      hostname: dependencies.hostname,
      pid: dependencies.pid,
      version: dependencies.version,
      currentOperationId: currentOperation?.operationId,
      leaseGeneration: currentOperation?.leaseGeneration,
      error,
    };
  };

  const publishBestEffort = async (
    status: 'running' | 'draining' | 'failed',
    error?: string
  ): Promise<void> => {
    try {
      await dependencies.upsertHeartbeat(heartbeatInput(status, error));
    } catch (heartbeatError: unknown) {
      log.error('Failed to publish Apps worker heartbeat', {
        workerId,
        status,
        error: heartbeatError instanceof Error ? heartbeatError.message : String(heartbeatError),
      });
    }
  };

  const waitForHeartbeatWrite = async (write: Promise<void>): Promise<void> => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const completed = await Promise.race([
      write.then(() => true),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), dependencies.heartbeatWriteTimeoutMs);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    if (!completed) {
      log.error('Apps worker heartbeat write timed out', {
        workerId,
        timeoutMs: dependencies.heartbeatWriteTimeoutMs,
      });
    }
  };

  const startPeriodicHeartbeat = (): void => {
    if (heartbeatWriteInFlight) return;
    const write = publishBestEffort('running');
    heartbeatWriteInFlight = write;
    void write.finally(() => {
      if (heartbeatWriteInFlight === write) heartbeatWriteInFlight = null;
    });
  };

  const markStoppedBestEffort = async (): Promise<void> => {
    try {
      await dependencies.markStopped(workerId);
    } catch (stopError: unknown) {
      log.error('Failed to mark Apps worker stopped', {
        workerId,
        error: stopError instanceof Error ? stopError.message : String(stopError),
      });
    }
  };

  const shutdown = (reason: ShutdownReason, error?: unknown): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      runner?.stopClaiming();
      const drainPromise = runner
        ? runner.drain(dependencies.drainTimeoutMs)
        : Promise.resolve<'drained'>('drained');

      const activeHeartbeatWrite = heartbeatWriteInFlight;
      if (activeHeartbeatWrite) await waitForHeartbeatWrite(activeHeartbeatWrite);

      const message = error instanceof Error ? error.message : error ? String(error) : undefined;
      if (reason === 'fatal') {
        await waitForHeartbeatWrite(
          publishBestEffort('failed', message ?? 'Apps worker stopped after a fatal error')
        );
      } else {
        await waitForHeartbeatWrite(publishBestEffort('draining'));
      }

      const drainResult = await drainPromise;
      if (drainResult === 'timed_out') {
        log.error('Apps worker drain timed out', {
          workerId,
          currentOperation: runner?.getCurrentOperation() ?? null,
          timeoutMs: dependencies.drainTimeoutMs,
        });
      } else if (reason === 'signal') {
        await waitForHeartbeatWrite(markStoppedBestEffort());
      }

      dependencies.exit(reason === 'fatal' ? 1 : 0);
    })();

    return shutdownPromise;
  };

  try {
    await dependencies.connectDB();
    await dependencies.upsertHeartbeat(heartbeatInput('starting'));

    runner = dependencies.startRunner(workerId, {
      onFatal: (error) => {
        void shutdown('fatal', error);
      },
    });

    await dependencies.upsertHeartbeat(heartbeatInput('running'));
    heartbeatTimer = setInterval(() => {
      startPeriodicHeartbeat();
    }, dependencies.heartbeatIntervalMs);

    dependencies.registerSignalHandler('SIGTERM', () => {
      void shutdown('signal');
    });
    dependencies.registerSignalHandler('SIGINT', () => {
      void shutdown('signal');
    });

    log.info('Apps worker started', { workerId });
    return { workerId, shutdown };
  } catch (error: unknown) {
    log.error('Apps worker failed to start', {
      workerId,
      error: error instanceof Error ? error.message : String(error),
    });
    await shutdown('fatal', error);
    throw error;
  }
}

if (process.env.NODE_ENV !== 'test') {
  void runAppsWorkerProcess().catch(() => {
    // Startup errors are logged and terminate the process inside runAppsWorkerProcess().
  });
}
