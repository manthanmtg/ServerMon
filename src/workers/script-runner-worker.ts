import 'dotenv/config';
import { disconnect } from 'mongoose';
import { createLogger } from '@/lib/logger';
import { runWorker } from '@/lib/script-runner/worker';

const log = createLogger('script-runner:worker');
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());

void runWorker(controller.signal)
  .catch((error) => {
    log.error('Script Runner worker failed to start', error);
    process.exitCode = 1;
  })
  .finally(() => disconnect());
