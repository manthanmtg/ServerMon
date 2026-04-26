/** @vitest-environment node */
import { appendFile, mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupAIRunnerArtifacts,
  ensureAIRunnerArtifactDir,
  readAIRunnerExit,
  readAIRunnerMetadata,
  resolveAIRunnerArtifactPaths,
  tailAIRunnerArtifactOutput,
  writeAIRunnerExit,
  writeAIRunnerMetadata,
} from './artifact-store';

let tempDir: string;

beforeEach(async () => {
  tempDir = await import('node:fs/promises').then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), 'servermon-airunner-artifacts-'))
  );
});

afterEach(async () => {
  await import('node:fs/promises').then((fs) => fs.rm(tempDir, { recursive: true, force: true }));
});

describe('ai-runner artifact store', () => {
  it('creates run folders and writes metadata', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run/one');

    await writeAIRunnerMetadata(paths, {
      jobId: 'job1',
      runId: 'run/one',
      command: 'echo hello',
      shell: '/bin/bash',
      workingDirectory: tempDir,
      agentProfileId: 'profile1',
      timeoutMinutes: 10,
      createdAt: '2026-04-26T00:00:00.000Z',
    });

    await expect(stat(paths.artifactDir)).resolves.toEqual(expect.objectContaining({}));
    await expect(readAIRunnerMetadata(paths)).resolves.toEqual(
      expect.objectContaining({
        jobId: 'job1',
        runId: 'run/one',
        command: 'echo hello',
      })
    );
  });

  it('writes and reads exit markers', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run2');

    await writeAIRunnerExit(paths, {
      jobId: 'job2',
      runId: 'run2',
      exitCode: 0,
      signal: null,
      startedAt: '2026-04-26T00:00:00.000Z',
      finishedAt: '2026-04-26T00:00:03.000Z',
      durationSeconds: 3,
    });

    await expect(readAIRunnerExit(paths)).resolves.toEqual({
      jobId: 'job2',
      runId: 'run2',
      exitCode: 0,
      signal: null,
      startedAt: '2026-04-26T00:00:00.000Z',
      finishedAt: '2026-04-26T00:00:03.000Z',
      durationSeconds: 3,
    });
  });

  it('returns null for malformed exit markers', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run3');
    await ensureAIRunnerArtifactDir(paths);
    await writeFile(paths.exitPath, '{broken', 'utf8');

    await expect(readAIRunnerExit(paths)).resolves.toBeNull();
  });

  it('tails output logs and reports truncation', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run4');
    await ensureAIRunnerArtifactDir(paths);
    await appendFile(paths.stdoutPath, 'hello stdout\n');
    await appendFile(paths.stderrPath, 'hello stderr\n');
    await appendFile(paths.combinedPath, 'first\nsecond\nthird\n');

    await expect(tailAIRunnerArtifactOutput(paths, 12)).resolves.toEqual({
      stdout: 'ello stdout\n',
      stderr: 'ello stderr\n',
      rawOutput: 'econd\nthird\n',
      truncatedStdout: true,
      truncatedStderr: true,
      truncatedRaw: true,
    });
  });

  it('cleans old artifacts while skipping active run ids', async () => {
    const oldPaths = resolveAIRunnerArtifactPaths(tempDir, 'old-run');
    const activePaths = resolveAIRunnerArtifactPaths(tempDir, 'active-run');
    const freshPaths = resolveAIRunnerArtifactPaths(tempDir, 'fresh-run');
    await Promise.all([
      mkdir(oldPaths.artifactDir, { recursive: true }),
      mkdir(activePaths.artifactDir, { recursive: true }),
      mkdir(freshPaths.artifactDir, { recursive: true }),
    ]);
    const oldDate = new Date('2026-04-01T00:00:00.000Z');
    await Promise.all([
      utimes(oldPaths.artifactDir, oldDate, oldDate),
      utimes(activePaths.artifactDir, oldDate, oldDate),
    ]);

    const deleted = await cleanupAIRunnerArtifacts({
      baseDir: tempDir,
      retentionDays: 7,
      activeRunIds: new Set(['active-run']),
      now: new Date('2026-04-26T00:00:00.000Z'),
    });

    expect(deleted).toEqual([oldPaths.artifactDir]);
    await expect(readFile(path.join(oldPaths.artifactDir, 'metadata.json'))).rejects.toThrow();
    await expect(stat(activePaths.artifactDir)).resolves.toEqual(expect.objectContaining({}));
    await expect(stat(freshPaths.artifactDir)).resolves.toEqual(expect.objectContaining({}));
  });
});
