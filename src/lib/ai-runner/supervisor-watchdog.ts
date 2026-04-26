import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import AIRunnerSupervisorLease from '@/models/AIRunnerSupervisorLease';
import { ensureAIRunnerSupervisor } from './processes';
import { DEFAULT_LEASE_TTL_MS, LEASE_ID } from './shared';
import { writeAIRunnerLogEntry } from './logs';

const log = createLogger('ai-runner:supervisor-watchdog');
const DEFAULT_WATCHDOG_INTERVAL_MS = Math.max(5_000, Math.floor(DEFAULT_LEASE_TTL_MS / 2));

let watchdogStarted = false;

function supervisorWatchdogDisabled(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.AI_RUNNER_DISABLE_SUPERVISOR === '1';
}

export async function checkAIRunnerSupervisorWatchdog(): Promise<void> {
  if (supervisorWatchdogDisabled()) {
    return;
  }

  await connectDB();
  const lease = await AIRunnerSupervisorLease.findById(LEASE_ID).lean<{
    expiresAt?: Date | string;
  } | null>();
  const expiresAt = lease?.expiresAt ? new Date(lease.expiresAt) : null;
  const leaseFresh = expiresAt ? expiresAt.getTime() > Date.now() : false;

  if (leaseFresh) {
    return;
  }

  ensureAIRunnerSupervisor();
  void writeAIRunnerLogEntry({
    level: 'info',
    component: 'ai-runner:supervisor-watchdog',
    event: 'supervisor.watchdog_spawn_requested',
    message: 'AI Runner supervisor watchdog requested supervisor start',
    data: {
      leaseExpiresAt: expiresAt?.toISOString(),
    },
  });
}

export function startAIRunnerSupervisorWatchdog(intervalMs = DEFAULT_WATCHDOG_INTERVAL_MS): void {
  if (watchdogStarted || supervisorWatchdogDisabled()) {
    return;
  }

  watchdogStarted = true;

  const tick = async (): Promise<void> => {
    try {
      await checkAIRunnerSupervisorWatchdog();
    } catch (error) {
      log.error('AI Runner supervisor watchdog tick failed', error);
      void writeAIRunnerLogEntry({
        level: 'error',
        component: 'ai-runner:supervisor-watchdog',
        event: 'supervisor.watchdog_failed',
        message: 'AI Runner supervisor watchdog tick failed',
        data: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  setTimeout(() => {
    void tick();
  }, 0).unref();

  setInterval(() => {
    void tick();
  }, intervalMs).unref();
}
