import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AgentToolAction, AgentToolJob, AgentType } from '@/modules/ai-agents/types';
import { getAgentToolAction } from './tool-catalog';

const MAX_OUTPUT_CHARS = 80_000;
const MAX_JOBS = 30;

export interface AgentToolJobStore {
  start(toolType: AgentType, action: AgentToolAction): AgentToolJob;
  get(id: string): AgentToolJob | undefined;
  list(): AgentToolJob[];
}

function appendOutput(job: AgentToolJob, chunk: string) {
  const next = `${job.output}${chunk}`;
  job.output = next.length > MAX_OUTPUT_CHARS ? next.slice(next.length - MAX_OUTPUT_CHARS) : next;
  job.updatedAt = new Date().toISOString();
}

export function createAgentToolJobStore(): AgentToolJobStore {
  const jobs = new Map<string, AgentToolJob>();

  function remember(job: AgentToolJob) {
    jobs.set(job.id, job);
    const ordered = [...jobs.values()].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    for (const stale of ordered.slice(MAX_JOBS)) jobs.delete(stale.id);
  }

  return {
    start(toolType, action) {
      const configuredAction = getAgentToolAction(toolType, action);
      if (!configuredAction) {
        throw new Error(`No ${action} action is configured for ${toolType}`);
      }

      const [file, ...args] = configuredAction.command;
      if (!file) {
        throw new Error(`No command is configured for ${toolType}`);
      }

      const now = new Date().toISOString();
      const job: AgentToolJob = {
        id: randomUUID(),
        toolType,
        action,
        status: 'running',
        command: configuredAction.command,
        output: `$ ${configuredAction.command.join(' ')}\n`,
        startedAt: now,
        updatedAt: now,
      };
      remember(job);

      const child = spawn(file, args, { env: process.env, shell: false });
      child.stdout?.on('data', (chunk: Buffer) => appendOutput(job, chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => appendOutput(job, chunk.toString()));
      child.on('error', (error) => {
        job.status = 'failed';
        job.error = error.message;
        job.finishedAt = new Date().toISOString();
        appendOutput(job, `${error.message}\n`);
      });
      child.on('close', (code) => {
        job.exitCode = code ?? undefined;
        job.status = code === 0 ? 'succeeded' : 'failed';
        job.finishedAt = new Date().toISOString();
        job.updatedAt = job.finishedAt;
      });

      return { ...job };
    },
    get(id) {
      const job = jobs.get(id);
      return job ? { ...job } : undefined;
    },
    list() {
      return [...jobs.values()]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .map((job) => ({ ...job }));
    },
  };
}

let store: AgentToolJobStore | null = null;

export function getAgentToolJobStore(): AgentToolJobStore {
  store ??= createAgentToolJobStore();
  return store;
}
