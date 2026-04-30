/** @vitest-environment node */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveAIRunnerArtifactPaths } from './artifact-store';
import { runAIRunnerExecutionWrapper } from './execution-wrapper';

describe('ai-runner execution wrapper', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'servermon-wrapper-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeLaunchFile(overrides: Partial<{ command: string; metadata: unknown }> = {}) {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run-1');
    const launchPath = path.join(paths.artifactDir, 'launch.json');
    await mkdir(paths.artifactDir, { recursive: true });
    await writeFile(
      paths.metadataPath,
      JSON.stringify(
        overrides.metadata ?? {
          createdAt: '2026-04-30T10:00:00.000Z',
          existing: true,
        }
      ),
      'utf8'
    ).catch(() => undefined);
    await writeFile(
      launchPath,
      `${JSON.stringify(
        {
          jobId: 'job-1',
          runId: 'run-1',
          shell: '/bin/sh',
          command: overrides.command ?? 'printf stdout-text; printf stderr-text >&2',
          cwd: tempDir,
          env: { PATH: process.env.PATH },
          paths,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    return { launchPath, paths };
  }

  it('requires a launch file path', async () => {
    await expect(runAIRunnerExecutionWrapper(undefined)).rejects.toThrow(
      'AI Runner execution wrapper requires a launch file path'
    );
  });

  it('captures stdout, stderr, combined output, metadata, and exit payload', async () => {
    const { launchPath, paths } = await writeLaunchFile();

    await runAIRunnerExecutionWrapper(launchPath);

    await expect(readFile(paths.stdoutPath, 'utf8')).resolves.toBe('stdout-text');
    await expect(readFile(paths.stderrPath, 'utf8')).resolves.toBe('stderr-text');
    await expect(readFile(paths.combinedPath, 'utf8')).resolves.toBe('stdout-textstderr-text');
    await expect(readFile(paths.metadataPath, 'utf8').then(JSON.parse)).resolves.toMatchObject({
      jobId: 'job-1',
      runId: 'run-1',
      command: 'printf stdout-text; printf stderr-text >&2',
      shell: '/bin/sh',
      workingDirectory: tempDir,
      createdAt: '2026-04-30T10:00:00.000Z',
      existing: true,
      executionRef: {
        pid: expect.any(Number),
        processGroupId: expect.any(Number),
      },
    });
    await expect(readFile(paths.exitPath, 'utf8').then(JSON.parse)).resolves.toMatchObject({
      jobId: 'job-1',
      runId: 'run-1',
      exitCode: 0,
      signal: null,
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
      durationSeconds: expect.any(Number),
    });
    await expect(readFile(paths.wrapperLogPath, 'utf8')).resolves.toContain('finished job job-1');
  });

  it('uses the wrapper start time as metadata createdAt when metadata is missing', async () => {
    const { launchPath, paths } = await writeLaunchFile({ metadata: undefined });
    await rm(paths.metadataPath, { force: true });

    await runAIRunnerExecutionWrapper(launchPath);

    const metadata = JSON.parse(await readFile(paths.metadataPath, 'utf8')) as {
      createdAt?: string;
    };
    expect(metadata.createdAt).toEqual(expect.any(String));
    expect(Date.parse(metadata.createdAt ?? '')).not.toBeNaN();
  });

  it('records non-zero exit codes without throwing', async () => {
    const { launchPath, paths } = await writeLaunchFile({ command: 'exit 7' });

    await runAIRunnerExecutionWrapper(launchPath);

    await expect(readFile(paths.exitPath, 'utf8').then(JSON.parse)).resolves.toMatchObject({
      exitCode: 7,
      signal: null,
    });
  });

  it('continues when existing metadata is malformed', async () => {
    const { launchPath, paths } = await writeLaunchFile();
    await writeFile(paths.metadataPath, '{not-json', 'utf8');

    await runAIRunnerExecutionWrapper(launchPath);

    await expect(readFile(paths.metadataPath, 'utf8').then(JSON.parse)).resolves.toMatchObject({
      jobId: 'job-1',
      runId: 'run-1',
    });
  });
});
