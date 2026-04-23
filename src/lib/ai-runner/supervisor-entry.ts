import 'dotenv/config';
import { createLogger } from '@/lib/logger';
import { writeAIRunnerLogEntry } from './logs';
import { AIRunnerSupervisor } from './supervisor';

const log = createLogger('ai-runner:supervisor-entry');

async function main(): Promise<void> {
  await writeAIRunnerLogEntry({
    level: 'info',
    component: 'ai-runner:supervisor-entry',
    event: 'supervisor.entry_started',
    message: 'AI Runner supervisor entrypoint started',
    data: { pid: process.pid },
  });
  await new AIRunnerSupervisor().run();
}

void main().catch((error) => {
  log.error('AI Runner supervisor crashed', error);
  void writeAIRunnerLogEntry({
    level: 'error',
    component: 'ai-runner:supervisor-entry',
    event: 'supervisor.entry_crashed',
    message: 'AI Runner supervisor entrypoint crashed',
    data: {
      error: error instanceof Error ? error.message : String(error),
    },
  });
  process.exitCode = 1;
});
