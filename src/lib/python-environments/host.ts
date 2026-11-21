import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { PythonInterpreter } from '@/modules/python-environments/types';

const control = '/usr/local/libexec/servermon-python-env-control';
const exec = promisify(execFile);
const LOG_LIMIT = 16_384;
export const pythonBuildSupported = process.platform === 'linux';
const metadata = z.object({
  pythonVersion: z.string().regex(/^3\.\d+\.\d+$/),
  packages: z
    .array(z.object({ name: z.string().min(1).max(128), version: z.string().min(1).max(128) }))
    .max(2048),
});

export async function probeInterpreters(signal?: AbortSignal): Promise<PythonInterpreter[]> {
  const { stdout } = await exec('/usr/bin/sudo', ['-n', control, 'probe'], {
    signal,
    timeout: 15_000,
  });
  const distinct = new Map<string, PythonInterpreter>();
  for (const line of stdout.trim().split('\n')) {
    const [id, version] = line.split(' ');
    if (interpreterIdPattern.test(id) && /^3\.\d+\.\d+$/.test(version)) {
      distinct.set(id, { id, version });
    }
  }
  return [...distinct.values()].sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true })
  );
}

export const interpreterIdPattern =
  /^(?:python3(?:\.\d{1,2})?|uv-3\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2}))$/;

export async function installManagedPython(version: string, signal: AbortSignal) {
  try {
    await exec('/usr/bin/sudo', ['-n', control, 'install-python', version], {
      signal,
      timeout: 660_000,
      maxBuffer: 256_000,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    const output =
      typeof error === 'object' && error && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim().slice(-2048)
        : '';
    throw new PythonBuildError('Python interpreter installation failed.', output);
  }
}

export class PythonBuildError extends Error {
  constructor(
    message: string,
    public readonly log: string
  ) {
    super(message);
  }
}

export async function buildRevision(
  input: { environmentId: string; revisionId: string; interpreterId: string; requirements: string },
  onProgress: (stage: 'installing' | 'checking', log: string) => void,
  signal: AbortSignal
) {
  const child = spawn(
    '/usr/bin/sudo',
    ['-n', control, 'build', input.environmentId, input.revisionId, input.interpreterId],
    {
      stdio: 'pipe',
      signal,
    }
  );
  let log = '';
  let output = '';
  let result: z.output<typeof metadata> | undefined;
  let diskBytes: number | undefined;
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    log = (log + chunk).slice(-LOG_LIMIT);
  });
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    output += chunk;
    let newline: number;
    while ((newline = output.indexOf('\n')) >= 0) {
      const line = output.slice(0, newline);
      output = output.slice(newline + 1);
      if (line === 'SERVERMON_STAGE installing') onProgress('installing', log);
      else if (line === 'SERVERMON_STAGE checking') onProgress('checking', log);
      else if (line.startsWith('SERVERMON_RESULT ')) {
        try {
          result = metadata.parse(JSON.parse(line.slice('SERVERMON_RESULT '.length)));
        } catch {
          result = undefined;
        }
      } else if (line.startsWith('SERVERMON_BYTES ')) {
        diskBytes = Number(line.slice('SERVERMON_BYTES '.length));
      }
    }
    if (output.length > 2_000_000) output = '';
  });
  child.stdin.on('error', () => undefined);
  child.stdin.end(input.requirements);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (
    code !== 0 ||
    !result ||
    diskBytes === undefined ||
    !Number.isSafeInteger(diskBytes) ||
    diskBytes < 0
  ) {
    throw new PythonBuildError('Python environment build failed. See the build log.', log);
  }
  return { ...result, diskBytes, log };
}

export async function removeRevision(environmentId: string, revisionId: string) {
  await exec('/usr/bin/sudo', ['-n', control, 'remove', environmentId, revisionId], {
    timeout: 60_000,
  });
}
