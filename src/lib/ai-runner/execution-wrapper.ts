import 'dotenv/config';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import type { AIRunnerArtifactPathsDTO, AIRunnerExecutionExitDTO } from '@/modules/ai-runner/types';

interface DurableLaunchFile {
  jobId: string;
  runId: string;
  shell: string;
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  paths: AIRunnerArtifactPathsDTO;
}

async function appendWrapperLog(paths: AIRunnerArtifactPathsDTO, message: string): Promise<void> {
  await appendFile(paths.wrapperLogPath, `${new Date().toISOString()} ${message}\n`).catch(
    () => undefined
  );
}

async function main(): Promise<void> {
  const launchPath = process.argv[2];
  if (!launchPath) {
    throw new Error('AI Runner execution wrapper requires a launch file path');
  }

  const launch = JSON.parse(await readFile(launchPath, 'utf8')) as DurableLaunchFile;
  const startedAt = new Date();
  await appendWrapperLog(launch.paths, `starting job ${launch.jobId}`);

  const stdout = createWriteStream(launch.paths.stdoutPath, { flags: 'a' });
  const stderr = createWriteStream(launch.paths.stderrPath, { flags: 'a' });
  const combined = createWriteStream(launch.paths.combinedPath, { flags: 'a' });

  const child = spawn(launch.shell, ['-lc', launch.command], {
    cwd: launch.cwd,
    env: launch.env,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as ChildProcessByStdio<null, Readable, Readable>;

  const existingMetadata: Record<string, unknown> = await readFile(
    launch.paths.metadataPath,
    'utf8'
  )
    .then((raw) => JSON.parse(raw) as Record<string, unknown>)
    .catch(() => ({}));
  await writeFile(
    launch.paths.metadataPath,
    `${JSON.stringify(
      {
        ...existingMetadata,
        jobId: launch.jobId,
        runId: launch.runId,
        command: launch.command,
        shell: launch.shell,
        workingDirectory: launch.cwd,
        createdAt:
          typeof existingMetadata['createdAt'] === 'string'
            ? existingMetadata['createdAt']
            : startedAt.toISOString(),
        executionRef: {
          pid: child.pid,
          processGroupId: process.pid,
        },
      },
      null,
      2
    )}\n`
  );

  child.stdout?.on('data', (chunk: Buffer | string) => {
    const text = chunk.toString();
    stdout.write(text);
    combined.write(text);
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    const text = chunk.toString();
    stderr.write(text);
    combined.write(text);
  });

  const exit = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.on('error', (error: Error) => {
        void appendWrapperLog(launch.paths, `child error: ${error.message}`);
      });
      child.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
        resolve({ exitCode, signal });
      });
    }
  );

  const finishedAt = new Date();
  const exitPayload: AIRunnerExecutionExitDTO = {
    jobId: launch.jobId,
    runId: launch.runId,
    exitCode: exit.exitCode,
    signal: exit.signal,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)),
  };
  await writeFile(launch.paths.exitPath, `${JSON.stringify(exitPayload, null, 2)}\n`);
  await appendWrapperLog(launch.paths, `finished job ${launch.jobId}`);
  stdout.end();
  stderr.end();
  combined.end();
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
