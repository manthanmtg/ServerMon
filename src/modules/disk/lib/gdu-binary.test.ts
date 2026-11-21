// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, existsSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureGduExecutable, GDU_RELEASE_VERSION, installGdu } from './gdu-binary';

const execFileAsync = promisify(execFile);

const archTag = process.arch === 'x64' ? 'amd64' : 'arm64';
const binaryName = `gdu_${process.platform}_${archTag}`;
const checksumKey = `${process.platform}/${process.arch}`;
const realPath = process.env.PATH ?? '';
const tarDir =
  realPath.split(path.delimiter).find((dir) => dir && existsSync(path.join(dir, 'tar'))) ??
  realPath;

let fixtureDir: string;
let binDir: string;

beforeEach(async () => {
  fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'servermon-gdu-install-'));
  binDir = path.join(fixtureDir, 'bin');
  vi.stubEnv('SERVERMON_GDU_BIN_DIR', binDir);
  vi.stubEnv('SERVERMON_GDU_PATH', undefined);
  vi.stubEnv('SERVERMON_GDU_AUTO_INSTALL', 'false');
  vi.stubEnv('PATH', fixtureDir);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(fixtureDir, { recursive: true, force: true });
});

const VERSION_SOURCE =
  "if (process.argv[2] === '--version') { process.stdout.write('Version: v5.39.0'); } else { process.exit(0); }";

async function writeExecutable(name: string, source = VERSION_SOURCE) {
  const executable = path.join(fixtureDir, name);
  await writeFile(executable, `#!/usr/bin/env node\n${source}\n`, { mode: 0o700 });
  return executable;
}

async function buildReleaseArchive(source = 'process.exit(0);'): Promise<Buffer> {
  const stage = path.join(fixtureDir, 'stage');
  await mkdir(stage, { recursive: true });
  await writeFile(path.join(stage, binaryName), `#!/usr/bin/env node\n${source}\n`, {
    mode: 0o755,
  });
  const archivePath = path.join(fixtureDir, `${binaryName}.tgz`);
  await execFileAsync('tar', ['-czf', archivePath, '-C', stage, binaryName], {
    env: { NODE_ENV: process.env.NODE_ENV, PATH: tarDir },
  });
  return readFile(archivePath);
}

function responseWith(body: Buffer, status = 200) {
  return new Response(new Uint8Array(body), { status });
}

function fetchReturning(body: Buffer, status = 200) {
  return vi.fn(() => Promise.resolve(responseWith(body, status)));
}

function checksumsFor(body: Buffer): Record<string, string> {
  return { [checksumKey]: createHash('sha256').update(body).digest('hex') };
}

describe('ensureGduExecutable', () => {
  it('resolves SERVERMON_GDU_PATH without downloading', async () => {
    const executable = await writeExecutable('scanner');
    vi.stubEnv('SERVERMON_GDU_PATH', executable);
    const fetchImpl = vi.fn();

    await expect(ensureGduExecutable({ fetchImpl })).resolves.toBe(executable);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a missing SERVERMON_GDU_PATH without downloading', async () => {
    vi.stubEnv('SERVERMON_GDU_PATH', path.join(fixtureDir, 'missing'));
    const fetchImpl = vi.fn();

    await expect(ensureGduExecutable({ fetchImpl })).rejects.toThrow(
      /SERVERMON_GDU_PATH.*missing|missing.*SERVERMON_GDU_PATH/
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves gdu found on PATH before the managed directory', async () => {
    const onPath = await writeExecutable('gdu');
    vi.stubEnv('PATH', [fixtureDir, realPath].join(path.delimiter));
    const fetchImpl = vi.fn();

    await expect(ensureGduExecutable({ fetchImpl })).resolves.toBe(onPath);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips a PATH gdu that is GNU du or too old', async () => {
    await writeExecutable(
      'gdu',
      "if (process.argv[2] === '--version') { process.stdout.write('du (GNU coreutils) 9.1'); } else { process.exit(0); }"
    );
    const fetchImpl = vi.fn();

    await expect(ensureGduExecutable({ fetchImpl })).rejects.toThrow(
      /automatic installation is disabled/
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips a PATH gdu older than the required export version', async () => {
    await writeExecutable(
      'gdu',
      "if (process.argv[2] === '--version') { process.stdout.write('Version: v5.30.1'); } else { process.exit(0); }"
    );
    const fetchImpl = vi.fn();

    await expect(ensureGduExecutable({ fetchImpl })).rejects.toThrow(
      /automatic installation is disabled/
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves an existing managed binary without downloading', async () => {
    await mkdir(binDir, { recursive: true });
    const managed = path.join(binDir, 'gdu');
    await writeFile(managed, '#!/usr/bin/env node\nprocess.exit(0);\n', { mode: 0o755 });
    const fetchImpl = vi.fn();

    await expect(ensureGduExecutable({ fetchImpl })).resolves.toBe(managed);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('explains that automatic installation is disabled', async () => {
    const fetchImpl = vi.fn();

    await expect(ensureGduExecutable({ fetchImpl })).rejects.toThrow(
      /automatic installation is disabled/
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('installs once for concurrent scans and reuses the result', async () => {
    vi.stubEnv('SERVERMON_GDU_AUTO_INSTALL', 'true');
    vi.stubEnv('PATH', [tarDir, fixtureDir].join(path.delimiter));
    const body = await buildReleaseArchive();
    let releaseArchive!: (value: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (releaseArchive = resolve)));
    const deps = { fetchImpl, checksums: checksumsFor(body) };

    const first = ensureGduExecutable(deps);
    const second = ensureGduExecutable(deps);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    releaseArchive(responseWith(body));

    const expected = path.join(binDir, 'gdu');
    await expect(first).resolves.toBe(expected);
    await expect(second).resolves.toBe(expected);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(access(expected, fsConstants.X_OK)).resolves.toBeUndefined();
  });
});

describe('installGdu', () => {
  it('installs the verified release into the managed directory and cleans staging files', async () => {
    vi.stubEnv('PATH', [tarDir, fixtureDir].join(path.delimiter));
    const body = await buildReleaseArchive();
    const fetchImpl = fetchReturning(body);

    await expect(installGdu({ fetchImpl, checksums: checksumsFor(body) })).resolves.toBe(
      path.join(binDir, 'gdu')
    );

    await expect(stat(path.join(binDir, 'gdu'))).resolves.toMatchObject({
      mode: expect.any(Number),
    });
    expect(await readdir(binDir)).toEqual(['gdu']);
    expect(String(await readFile(path.join(binDir, 'gdu')))).toContain('process.exit(0);');
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://github.com/dundee/gdu/releases/download/v${GDU_RELEASE_VERSION}/${binaryName}.tgz`,
      expect.objectContaining({ redirect: 'follow' })
    );
  });

  it('rejects a checksum mismatch and leaves no binary behind', async () => {
    vi.stubEnv('PATH', [tarDir, fixtureDir].join(path.delimiter));
    const body = await buildReleaseArchive();
    const fetchImpl = fetchReturning(body);

    await expect(
      installGdu({ fetchImpl, checksums: { [checksumKey]: 'f'.repeat(64) } })
    ).rejects.toThrow(/checksum verification/);
    await expect(stat(path.join(binDir, 'gdu'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(binDir).catch(() => [])).not.toContain('gdu');
  });

  it('reports failed downloads without raw diagnostics', async () => {
    const fetchImpl = fetchReturning(Buffer.from('not found'), 404);

    await expect(installGdu({ fetchImpl })).rejects.toThrow(
      new RegExp(`GitHub releases returned 404.*${GDU_RELEASE_VERSION}`)
    );
  });

  it('reports unreachable release servers as a user-facing failure', async () => {
    await expect(
      installGdu({
        fetchImpl: vi.fn(() => Promise.reject(new Error('socket hang up'))),
      })
    ).rejects.toThrow(/Could not reach GitHub releases/);
  });

  it('explains platforms without a prebuilt release', async () => {
    const fetchImpl = vi.fn();

    await expect(installGdu({ fetchImpl, platform: 'win32', arch: 'x64' })).rejects.toThrow(
      /No prebuilt gdu/
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an empty download instead of installing a broken binary', async () => {
    const fetchImpl = fetchReturning(Buffer.alloc(0));

    await expect(installGdu({ fetchImpl })).rejects.toThrow(/empty gdu download/);
  });
});
