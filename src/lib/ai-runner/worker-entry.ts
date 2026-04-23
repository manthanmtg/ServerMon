import 'dotenv/config';
import { createLogger } from '@/lib/logger';
import { writeAIRunnerLogEntry } from './logs';
import { AIRunnerWorker } from './worker';

const log = createLogger('ai-runner:worker-entry');

async function main(): Promise<void> {
  const jobId = process.argv[2] ?? process.env.AI_RUNNER_JOB_ID;
  if (!jobId) {
    throw new Error('AI Runner worker requires a job id');
  }

  await writeAIRunnerLogEntry({
    level: 'info',
    component: 'ai-runner:worker-entry',
    event: 'worker.entry_started',
    message: 'AI Runner worker entrypoint started',
    data: {
      pid: process.pid,
      jobId,
    },
  });

  await new AIRunnerWorker(jobId).run();
}

void main()
  .catch((error) => {
    log.error('AI Runner worker crashed', error);
    void writeAIRunnerLogEntry({
      level: 'error',
      component: 'ai-runner:worker-entry',
      event: 'worker.entry_crashed',
      message: 'AI Runner worker entrypoint crashed',
      data: {
        error: error instanceof Error ? error.message : String(error),
        jobId: process.argv[2] ?? process.env.AI_RUNNER_JOB_ID,
      },
    });
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => {
      process.exit();
    }, 10).unref();
  });
