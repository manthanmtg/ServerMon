/** @vitest-environment node */
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIRunnerExecutionMetadataDTO } from '@/modules/ai-runner/types';
import {
  cleanupAIRunnerArtifacts,
  getDefaultAIRunnerArtifactBaseDir,
  readAIRunnerExit,
  readAIRunnerMetadata,
  resolveAIRunnerArtifactPaths,
  tailAIRunnerArtifactOutput,
  writeAIRunnerExit,
  writeAIRunnerMetadata,
} from './artifact-store';

function metadata(
  overrides: Partial<AIRunnerExecutionMetadataDTO> = {}
): AIRunnerExecutionMetadataDTO {
  return {
    jobId: 'job-1',
    runId: 'run-1',
    command: 'cmd',
    shell: '/bin/bash',
    workingDirectory: '/repo',
    agentProfileId: 'profile-1',
    timeoutMinutes: 30,
    createdAt: '2026-04-27T10:00:00.000Z',
    ...overrides,
  };
}

describe('ai-runner artifact store', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'servermon-artifacts-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('uses an explicit artifact directory environment override', () => {
    vi.stubEnv('AI_RUNNER_ARTIFACT_DIR', path.join(tempDir, '..', 'custom-artifacts'));

    expect(getDefaultAIRunnerArtifactBaseDir()).toBe(
      path.resolve(tempDir, '..', 'custom-artifacts')
    );
  });

  it('resolves run artifact paths under a sanitized run directory', () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, '../run id/with spaces and symbols!');

    expect(paths.artifactDir).toBe(
      path.join(tempDir, 'runs', '..-run-id-with-spaces-and-symbols-')
    );
    expect(paths.metadataPath).toBe(path.join(paths.artifactDir, 'metadata.json'));
    expect(paths.stdoutPath).toBe(path.join(paths.artifactDir, 'stdout.log'));
    expect(paths.stderrPath).toBe(path.join(paths.artifactDir, 'stderr.log'));
    expect(paths.combinedPath).toBe(path.join(paths.artifactDir, 'combined.log'));
    expect(paths.exitPath).toBe(path.join(paths.artifactDir, 'exit.json'));
    expect(paths.wrapperLogPath).toBe(path.join(paths.artifactDir, 'wrapper.log'));
  });

  it('writes and reads execution metadata as formatted JSON', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run-1');
    const executionMetadata = metadata({
      command: 'pnpm test',
    });

    await writeAIRunnerMetadata(paths, executionMetadata);

    await expect(readAIRunnerMetadata(paths)).resolves.toEqual(executionMetadata);
    await expect(readFile(paths.metadataPath, 'utf8')).resolves.toContain('\n');
  });

  it('returns null when metadata is missing or invalid', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run-1');

    await expect(readAIRunnerMetadata(paths)).resolves.toBeNull();

    await writeAIRunnerMetadata(paths, metadata());
    await writeFile(paths.metadataPath, '{not-json', 'utf8');

    await expect(readAIRunnerMetadata(paths)).resolves.toBeNull();
  });

  it('normalizes optional execution exit fields while reading', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run-1');

    await writeAIRunnerExit(paths, {
      jobId: 'job-1',
      runId: 'run-1',
      exitCode: null,
      signal: null,
      startedAt: '2026-04-27T10:00:00.000Z',
      finishedAt: '2026-04-27T10:00:02.000Z',
      durationSeconds: 2,
    });

    await expect(readAIRunnerExit(paths)).resolves.toEqual({
      jobId: 'job-1',
      runId: 'run-1',
      exitCode: null,
      signal: null,
      startedAt: '2026-04-27T10:00:00.000Z',
      finishedAt: '2026-04-27T10:00:02.000Z',
      durationSeconds: 2,
    });
  });

  it('rejects incomplete or malformed execution exit files', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run-1');

    await expect(readAIRunnerExit(paths)).resolves.toBeNull();

    await writeAIRunnerExit(paths, {
      jobId: 'job-1',
      runId: 'run-1',
      exitCode: 0,
      signal: null,
      startedAt: '2026-04-27T10:00:00.000Z',
      finishedAt: '2026-04-27T10:00:01.000Z',
      durationSeconds: 1,
    });
    await writeFile(paths.exitPath, JSON.stringify({ runId: 'run-1' }), 'utf8');

    await expect(readAIRunnerExit(paths)).resolves.toBeNull();
  });

  it('tails output files and prefers combined output for raw output', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run-1');
    await writeAIRunnerMetadata(paths, metadata());
    await writeFile(paths.stdoutPath, 'stdout-abcdef', 'utf8');
    await writeFile(paths.stderrPath, 'stderr-abcdef', 'utf8');
    await writeFile(paths.combinedPath, 'combined-abcdef', 'utf8');

    await expect(tailAIRunnerArtifactOutput(paths, 6)).resolves.toEqual({
      stdout: 'abcdef',
      stderr: 'abcdef',
      rawOutput: 'abcdef',
      truncatedStdout: true,
      truncatedStderr: true,
      truncatedRaw: true,
    });
  });

  it('builds raw output from stdout and stderr when combined output is absent', async () => {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run-1');
    await writeAIRunnerMetadata(paths, metadata());
    await writeFile(paths.stdoutPath, 'abc', 'utf8');
    await writeFile(paths.stderrPath, 'def', 'utf8');

    await expect(tailAIRunnerArtifactOutput(paths, 4)).resolves.toMatchObject({
      stdout: 'abc',
      stderr: 'def',
      rawOutput: 'cdef',
      truncatedRaw: true,
    });
  });

  it('deletes expired inactive artifact directories only', async () => {
    const expired = resolveAIRunnerArtifactPaths(tempDir, 'expired');
    const active = resolveAIRunnerArtifactPaths(tempDir, 'active');
    const fresh = resolveAIRunnerArtifactPaths(tempDir, 'fresh');
    const now = new Date('2026-04-27T12:00:00.000Z');
    const oldDate = new Date('2026-04-20T12:00:00.000Z');

    await Promise.all([
      writeAIRunnerMetadata(
        expired,
        metadata({
          jobId: 'job-expired',
          runId: 'expired',
          createdAt: '2026-04-20T12:00:00.000Z',
        })
      ),
      writeAIRunnerMetadata(
        active,
        metadata({
          jobId: 'job-active',
          runId: 'active',
          createdAt: '2026-04-20T12:00:00.000Z',
        })
      ),
      writeAIRunnerMetadata(
        fresh,
        metadata({
          jobId: 'job-fresh',
          runId: 'fresh',
          createdAt: '2026-04-27T10:00:00.000Z',
        })
      ),
    ]);
    await Promise.all([
      utimes(expired.artifactDir, oldDate, oldDate),
      utimes(active.artifactDir, oldDate, oldDate),
    ]);

    const deleted = await cleanupAIRunnerArtifacts({
      baseDir: tempDir,
      retentionDays: 3,
      activeRunIds: new Set(['active']),
      now,
    });

    expect(deleted).toEqual([expired.artifactDir]);
    await expect(stat(expired.artifactDir)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(active.artifactDir)).resolves.toBeDefined();
    await expect(stat(fresh.artifactDir)).resolves.toBeDefined();
  });
});
