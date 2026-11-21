/** @vitest-environment node */
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAIRunnerArtifactPaths } from './artifact-store';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: spawnMock };
});

import { runAIRunnerExecutionWrapper } from './execution-wrapper';

describe('ai-runner execution wrapper output capture', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'servermon-wrapper-stream-order-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('captures output emitted before metadata persistence completes', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run-1');
    const launchPath = path.join(paths.artifactDir, 'launch.json');
    await mkdir(paths.artifactDir, { recursive: true });
    await writeFile(paths.metadataPath, '{}\n', 'utf8');
    await writeFile(
      launchPath,
      `${JSON.stringify({
        jobId: 'job-1',
        runId: 'run-1',
        shell: '/bin/sh',
        command: 'echo ignored',
        cwd: tempDir,
        env: process.env,
        paths,
      })}\n`,
      'utf8'
    );

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        pid: number;
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.pid = 1234;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('early stdout'));
        child.stderr.emit('data', Buffer.from('early stderr'));
        child.emit('close', 0, null);
      });
      return child;
    });

    await runAIRunnerExecutionWrapper(launchPath);

    await expect(readFile(paths.stdoutPath, 'utf8')).resolves.toBe('early stdout');
    await expect(readFile(paths.stderrPath, 'utf8')).resolves.toBe('early stderr');
    await expect(readFile(paths.combinedPath, 'utf8')).resolves.toBe('early stdoutearly stderr');
  });
});
