import 'dotenv/config';
import { disconnect } from 'mongoose';
import { createLogger } from '@/lib/logger';
import { runPythonEnvironments } from '@/lib/python-environments/worker';
import { runWorker } from '@/lib/script-runner/worker';

const log = createLogger('script-runner:worker');
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());

const workers = [runWorker(controller.signal), runPythonEnvironments(controller.signal)];

void Promise.all(workers)
  .catch(async (error) => {
    controller.abort();
    log.error('Script Runner worker failed to start', error);
    process.exitCode = 1;
    await Promise.allSettled(workers);
  })
  .finally(() => disconnect());
