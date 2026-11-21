// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { encodeLaunch, parseRunnerProbe } from '@/lib/script-runner/systemd';

it.each([3, 4])(
  'runs directly from the selected virtual environment through protocol %i',
  async (protocol) => {
    const root = await mkdtemp(join(tmpdir(), 'servermon-python-launcher-'));
    const environmentId = randomUUID();
    const revisionId = randomUUID();
    const venv = join(root, environmentId, revisionId);
    const launcher = resolve('scripts/servermon-script-execute.py');
    try {
      execFileSync('python3', ['-m', 'venv', '--without-pip', venv], { timeout: 5000 });
      const version = execFileSync('python3', ['-I', launcher, '--runtimes'], {
        encoding: 'utf8',
        timeout: 5000,
      });
      expect(parseRunnerProbe(version)).toMatchObject({
        protocol: 4,
        runtimes: expect.arrayContaining(['python']),
      });
      const output = execFileSync(
        'python3',
        [
          '-I',
          '-c',
          'import runpy, sys; from pathlib import Path; main = runpy.run_path(sys.argv[1]); execute = main["execute"]; execute.__globals__["PYTHON_ENV_ROOT"] = Path(sys.argv[2]); execute()',
          launcher,
          root,
        ],
        {
          input: encodeLaunch(
            {
              cwd: root,
              language: 'python',
              source:
                'import os, sys; from pathlib import Path; print(sys.prefix); print(os.environ["VIRTUAL_ENV"]);' +
                (protocol === 4 ? ' assert Path("input.txt").read_text() == "fixture"' : ''),
              attachments: protocol === 4 ? [{ name: 'input.txt', content: 'Zml4dHVyZQ==' }] : [],
              args: [],
              pythonEnvironment: {
                environmentId,
                revisionId,
                name: 'Fixture',
                pythonVersion: '3.11.0',
              },
            },
            protocol
          ),
          env: { ...process.env, RUNTIME_DIRECTORY: root },
          encoding: 'utf8',
          timeout: 5000,
        }
      );
      expect(
        output
          .trim()
          .split('\n')
          .map((path) => path.replace(/^\/private\/var\//, '/var/'))
      ).toEqual([venv, venv].map((path) => path.replace(/^\/private\/var\//, '/var/')));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
);
