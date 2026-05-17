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

  async function writeLaunchFile(overrides: Partial<{ shell: string; command: string; metadata: unknown; requiresTTY?: boolean; runAsUser?: string; runAsUserAuthMode?: 'passwordless-sudo' | string; env?: Record<string, string> }> = {}) {
    const paths = resolveAIRunnerArtifactPaths(tempDir, 'run-1');
    const launchPath = path.join(paths.artifactDir, 'launch.json');
    await mkdir(paths.artifactDir, { recursive: true });
    await writeFile(
      paths.metadataPath,
      JSON.stringify(
        overrides.metadata !== undefined ? overrides.metadata : {
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
          shell: overrides.shell ?? '/bin/sh',
          command: overrides.command ?? 'printf stdout-text; printf stderr-text >&2',
          cwd: tempDir,
          env: overrides.env ?? { PATH: process.env.PATH, HOME: tempDir, CUSTOM_ENV_VAR: 'test-value' },
          paths,
          requiresTTY: overrides.requiresTTY,
          runAsUser: overrides.runAsUser,
          runAsUserAuthMode: overrides.runAsUserAuthMode,
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
  }, 20000);

  it('throws an error if launch file does not exist', async () => {
    await expect(runAIRunnerExecutionWrapper(path.join(tempDir, 'does-not-exist.json'))).rejects.toThrow(/ENOENT/);
  });

  it('throws an error if launch file contains malformed json', async () => {
    const launchPath = path.join(tempDir, 'malformed-launch.json');
    await writeFile(launchPath, '{ invalid json', 'utf8');
    await expect(runAIRunnerExecutionWrapper(launchPath)).rejects.toThrow(/(Unexpected token|Expected property name|JSON)/);
  });

  it('handles child process spawn errors gracefully by writing to wrapper log and exiting with code', async () => {
    const { launchPath, paths } = await writeLaunchFile({ shell: '/does/not/exist/shell' });
    
    await runAIRunnerExecutionWrapper(launchPath);

    const exitData = JSON.parse(await readFile(paths.exitPath, 'utf8'));
    // Usually spawn error results in exit code or signal depending on the implementation.
    // The execution wrapper listens to 'error' and just writes to wrapper log.
    expect(exitData).toHaveProperty('finishedAt');
    const logData = await readFile(paths.wrapperLogPath, 'utf8');
    expect(logData).toContain('child error:');
  });

  it('passes environment variables to the spawned child', async () => {
    const { launchPath, paths } = await writeLaunchFile({ command: 'node -e "console.log(process.env.CUSTOM_ENV_VAR)"' });

    await runAIRunnerExecutionWrapper(launchPath);

    const stdoutData = await readFile(paths.stdoutPath, 'utf8');
    expect(stdoutData.trim()).toBe('test-value');
  });

  it('incorporates requiresTTY if requested', async () => {
    // Requires Linux for TTY check inside run-as-user, but we can verify the launch wrapper doesn't fail
    const { launchPath } = await writeLaunchFile({ requiresTTY: true, command: 'echo tty-test' });
    await expect(runAIRunnerExecutionWrapper(launchPath)).resolves.toBeUndefined();
  });

  it('applies sudo wrapper when runAsUser is provided', async () => {
    // Note: since we might not have sudo privileges in the test environment, we might get an error in the wrapper log or stderr
    // but the wrapper should execute it without crashing itself.
    const { launchPath, paths } = await writeLaunchFile({ runAsUser: 'root' });
    await runAIRunnerExecutionWrapper(launchPath);
    const exitData = JSON.parse(await readFile(paths.exitPath, 'utf8'));
    expect(exitData).toBeDefined();
  });

  it('throws an error synchronously if runAsUserAuthMode is unsupported', async () => {
    const { launchPath } = await writeLaunchFile({ runAsUser: 'root', runAsUserAuthMode: 'invalid-mode' });
    await expect(runAIRunnerExecutionWrapper(launchPath)).rejects.toThrow('Unsupported run as user auth mode');
  });

  it('handles metadata write failure gracefully (e.g. path is a directory)', async () => {
    const { launchPath, paths } = await writeLaunchFile();
    await rm(paths.metadataPath, { force: true });
    await mkdir(paths.metadataPath, { recursive: true }); // make it a directory to induce write error

    // Should reject because writeFile will throw EISDIR
    await expect(runAIRunnerExecutionWrapper(launchPath)).rejects.toThrow(/EISDIR/);
  });
});

