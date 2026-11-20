import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { captureOutput, readOutput } from './output';
import { launchInput, retentionInput } from './schemas';
import { encodeLaunch, parseUnit } from './systemd';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('Script Runner', () => {
  it('validates absolute working directories and preserves literal arguments', () => {
    const draft = { title: 'Check', source: 'echo hi', cwd: '/tmp/a b', args: ['x; echo bad', ''] };
    expect(launchInput.parse(draft)).toMatchObject(draft);
    expect(launchInput.safeParse({ ...draft, cwd: 'relative' }).success).toBe(false);
    expect(launchInput.safeParse({ ...draft, args: ['a\0b'] }).success).toBe(false);
    expect(retentionInput.safeParse({ logRetentionDays: 0 }).success).toBe(false);
  });

  it('runs the launch protocol in the selected directory with arguments and closed stdin', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shell runner '));
    temporary.push(directory);
    const procedure = spawn('/bin/bash', [resolve('scripts/servermon-script-execute.sh')], {
      env: { ...process.env, RUNTIME_DIRECTORY: directory, MONGO_URI: 'should-not-reach-script' },
    });
    const file = join(directory, 'output');
    const result = captureOutput(procedure, file);
    procedure.stdin.end(
      encodeLaunch({
        cwd: directory,
        args: ['space and $dollar', ''],
        source:
          'printf "%s|%s|%s|%s|%s\\n" "$PWD" "$1" "$#" "${MONGO_URI-unset}" "${2-empty}"; if read -r line; then exit 99; fi; printf "warning" >&2; exit 17',
      })
    );
    expect(await result).toMatchObject({ code: 17, signal: null, truncated: false });
    const output = await readOutput(file, 0);
    expect(output.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stream: 'stdout',
          text: expect.stringContaining('space and $dollar|2|unset|\n'),
        }),
        expect.objectContaining({ stream: 'stderr', text: 'warning' }),
      ])
    );
    expect((await readOutput(file, output.cursor)).entries).toEqual([]);
    expect(await readFile(file, 'utf8')).toContain('"stream":"stdout"');
  });

  it('drains a noisy script after reaching the disk limit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'script-runner-'));
    temporary.push(directory);
    const process = spawn('/bin/bash', ['-c', 'printf "%50000s" x; exit 7']);
    const file = join(directory, 'output');
    expect(await captureOutput(process, file, 1000)).toMatchObject({ code: 7, truncated: true });
    expect((await readFile(file)).length).toBeLessThanOrEqual(1000);
  });

  it('reads a timed-out unit without treating the signal as an exit code', () => {
    expect(
      parseUnit(
        'LoadState=loaded\nActiveState=failed\nResult=timeout\nExecMainCode=2\nExecMainStatus=15\n'
      )
    ).toEqual({ state: 'failed', result: 'timeout', exitCode: null, signal: 15 });
  });
});
