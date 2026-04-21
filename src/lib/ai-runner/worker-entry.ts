import 'dotenv/config';
import { createLogger } from '@/lib/logger';
import { AIRunnerWorker } from './worker';

const log = createLogger('ai-runner:worker-entry');

async function main(): Promise<void> {
  const jobId = process.argv[2] ?? process.env.AI_RUNNER_JOB_ID;
  if (!jobId) {
    throw new Error('AI Runner worker requires a job id');
  }

  await new AIRunnerWorker(jobId).run();
}

void main()
  .catch((error) => {
    log.error('AI Runner worker crashed', error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => {
      process.exit();
    }, 10).unref();
  });
