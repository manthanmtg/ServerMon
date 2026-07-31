import 'dotenv/config';
import { hostname } from 'os';
import connectDB from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { APPS_WORKER_HEARTBEAT_MS } from '@/lib/apps/config';
import {
  markAppsWorkerStopped,
  upsertAppsWorkerHeartbeat,
} from '@/lib/apps/repositories/worker-heartbeat-repository';
import { startAppsWorkerRunner } from '@/lib/apps/worker/runner';

const log = createLogger('apps:worker');

async function main() {
  await connectDB();

  const workerId = `apps-worker-${hostname()}-${process.pid}-${Date.now()}`;
  const host = hostname();
  const version = process.env.npm_package_version;

  await upsertAppsWorkerHeartbeat({
    workerId,
    status: 'running',
    hostname: host,
    pid: process.pid,
    version,
  });

  const heartbeat = setInterval(() => {
    void upsertAppsWorkerHeartbeat({
      workerId,
      status: 'running',
      hostname: host,
      pid: process.pid,
      version,
    });
  }, APPS_WORKER_HEARTBEAT_MS);

  const runner = startAppsWorkerRunner(workerId);

  const shutdown = async () => {
    clearInterval(heartbeat);
    runner.stop();
    await upsertAppsWorkerHeartbeat({
      workerId,
      status: 'draining',
      hostname: host,
      pid: process.pid,
      version,
    });
    await markAppsWorkerStopped(workerId);
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });

  log.info('Apps worker started', { workerId });
}

main().catch((error) => {
  log.error('Apps worker failed to start', { error });
  process.exit(1);
});
