import 'dotenv/config';
import { createLogger } from '@/lib/logger';
import { AIRunnerSupervisor } from './supervisor';

const log = createLogger('ai-runner:supervisor-entry');

async function main(): Promise<void> {
  await new AIRunnerSupervisor().run();
}

void main().catch((error) => {
  log.error('AI Runner supervisor crashed', error);
  process.exitCode = 1;
});
