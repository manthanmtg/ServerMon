// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiskScanError, scanDisk } from './gdu';

const scanPath = '/srv/demo folder;$(touch example)';
const metadata = { progname: 'gdu', progver: 'v5.39.0', timestamp: 1_795_261_566 };

let fixtureDir: string;

beforeEach(async () => {
  fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'servermon-gdu-test-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(fixtureDir, { recursive: true, force: true });
});

async function setFakeExecutable(source: string, name = 'scanner') {
  const executable = path.join(fixtureDir, name);
  await writeFile(executable, `#!/usr/bin/env node\n${source}\n`, { mode: 0o700 });
  vi.stubEnv('SERVERMON_GDU_PATH', executable);
}

async function setFakeExport(root: unknown, header = metadata) {
  const output = JSON.stringify([1, 2, header, root]);
  await setFakeExecutable(`process.stdout.write(${JSON.stringify(output)});`);
}

describe('scanDisk', () => {
  it('passes the full path as one argument and runs a read-only, single-filesystem export', async () => {
    const output = JSON.stringify([1, 2, metadata, [{ name: scanPath, dsize: 4096, items: 1 }]]);
    await setFakeExecutable(
      `const args = process.argv.slice(2);
       if (args[0] !== '-x' || args[1] !== '-o' || args[2] !== '-' ||
           args.at(-2) !== '--' || args.at(-1) !== ${JSON.stringify(scanPath)} ||
           !args.includes('--config-file=/dev/null') || !args.includes('--db=')) process.exit(19);
       process.stdout.write(${JSON.stringify(output)});`,
      'scanner with spaces'
    );

    await expect(scanDisk(scanPath)).resolves.toEqual({
      root: { name: scanPath, size: 4096, readError: false, children: [] },
      partial: false,
    });
  });

  it('uses gdu from PATH when the override is absent', async () => {
    const output = JSON.stringify([1, 2, metadata, [{ name: '/', dsize: 0, items: 1 }]]);
    await setFakeExecutable(
      `if (process.argv[2] === '--version') { process.stdout.write('Version: v5.39.0'); }
       process.stdout.write(${JSON.stringify(output)});`,
      'gdu'
    );
    vi.stubEnv('SERVERMON_GDU_PATH', undefined);
    vi.stubEnv('PATH', [fixtureDir, process.env.PATH].join(path.delimiter));

    await expect(scanDisk('/')).resolves.toMatchObject({ root: { name: '/', size: 0 } });
  });

  it('uses the exported directory aggregate and counts sparse files as zero allocated bytes', async () => {
    await setFakeExport([
      { name: scanPath, dsize: 8192, asize: 1_058_576, items: 5 },
      { name: 'sparse', asize: 1_048_576 },
      [{ name: 'empty', dsize: 0, asize: 512, items: 1 }],
      { name: 'archive', asize: 700, dsize: 4096 },
      { name: 'pointer', asize: 7, notreg: true },
    ]);

    await expect(scanDisk(scanPath)).resolves.toEqual({
      root: {
        name: scanPath,
        size: 8192,
        readError: false,
        children: [
          { name: 'archive', size: 4096, readError: false },
          { name: 'empty', size: 0, readError: false, children: [] },
          { name: 'pointer', size: 0, readError: false, special: true },
          { name: 'sparse', size: 0, readError: false },
        ],
      },
      partial: false,
    });
  });

  it('uses gdu_dsize when a newer export puts directory-only bytes in dsize', async () => {
    await setFakeExport(
      [
        { name: scanPath, dsize: 512, gdu_dsize: 4096, items: 3 },
        [{ name: 'nested', gdu_dsize: 0, items: 1 }],
        { name: 'file', dsize: 4096 },
      ],
      { ...metadata, progver: 'v6.0.0' }
    );

    await expect(scanDisk(scanPath)).resolves.toMatchObject({
      root: {
        size: 4096,
        children: [
          { name: 'file', size: 4096 },
          { name: 'nested', size: 0 },
        ],
      },
      partial: false,
    });
  });

  it('propagates nested read errors to ancestors and retains readable siblings', async () => {
    await setFakeExport([
      { name: scanPath, dsize: 4096, items: 4 },
      [
        { name: 'nested', dsize: 4096, items: 3 },
        [{ name: 'unreadable', dsize: 0, items: 1, read_error: true }],
        { name: 'readable', dsize: 4096 },
      ],
    ]);

    await expect(scanDisk(scanPath)).resolves.toMatchObject({
      partial: true,
      root: {
        readError: true,
        children: [
          {
            name: 'nested',
            readError: true,
            children: [
              { name: 'readable', readError: false },
              { name: 'unreadable', readError: true, children: [] },
            ],
          },
        ],
      },
    });
  });

  it('keeps signed Unix modification times when the export supplies them', async () => {
    await setFakeExport([
      { name: scanPath, dsize: 4096, mtime: 1_795_261_566 },
      { name: 'older', dsize: 4096, mtime: -1 },
    ]);

    await expect(scanDisk(scanPath)).resolves.toMatchObject({
      root: { modifiedAt: 1_795_261_566, children: [{ name: 'older', modifiedAt: -1 }] },
    });
  });

  it.each([
    ['a mismatched root', [{ name: '/other', dsize: 0 }]],
    ['a root file', { name: scanPath, dsize: 0 }],
    [
      'a negative size',
      [
        { name: scanPath, dsize: 0 },
        { name: 'bad', dsize: -1 },
      ],
    ],
    ['an unsafe size', [{ name: scanPath, dsize: Number.MAX_SAFE_INTEGER + 1 }]],
    ['a malformed read error', [{ name: scanPath, dsize: 0, read_error: 'true' }]],
    [
      'a fractional mtime',
      [
        { name: scanPath, dsize: 0 },
        { name: 'bad', mtime: 1.5 },
      ],
    ],
    ['a malformed child', [{ name: scanPath, dsize: 0 }, []]],
    ['duplicate siblings', [{ name: scanPath, dsize: 0 }, { name: 'a' }, { name: 'a' }]],
  ])('rejects %s', async (_description, root) => {
    await setFakeExport(root);

    await expect(scanDisk(scanPath)).rejects.toBeInstanceOf(DiskScanError);
  });

  it.each(['', '.', '..', 'nested/file', 'bad\0name'])(
    'rejects invalid child names %j',
    async (name) => {
      await setFakeExport([{ name: scanPath, dsize: 0 }, { name }]);

      await expect(scanDisk(scanPath)).rejects.toBeInstanceOf(DiskScanError);
    }
  );

  it('keeps a backslash inside a POSIX child name', async () => {
    await setFakeExport([
      { name: scanPath, dsize: 4096 },
      { name: 'back\\slash', dsize: 4096 },
    ]);

    await expect(scanDisk(scanPath)).resolves.toMatchObject({
      root: { children: [{ name: 'back\\slash', size: 4096 }] },
    });
  });

  it('keeps an explicit replacement-character root and skips ambiguous descendant names', async () => {
    const rootPath = '/srv/allowed\uFFFDroot';
    await setFakeExport([
      { name: rootPath, dsize: 12_288 },
      [
        { name: 'nested', dsize: 12_288 },
        { name: 'ambiguous\uFFFD', dsize: 4096 },
        [{ name: 'ambiguous\uFFFD', dsize: 4096 }],
        { name: 'visible', dsize: 4096 },
      ],
    ]);

    await expect(scanDisk(rootPath)).resolves.toMatchObject({
      partial: true,
      root: {
        name: rootPath,
        readError: true,
        children: [
          { name: 'nested', readError: true, children: [{ name: 'visible', readError: false }] },
        ],
      },
    });
  });

  it('rejects a non-gdu export', async () => {
    await setFakeExport([{ name: scanPath, dsize: 0 }], { ...metadata, progname: 'ncdu' });

    await expect(scanDisk(scanPath)).rejects.toBeInstanceOf(DiskScanError);
  });

  it('explains when the export lacks directory totals', async () => {
    await setFakeExport([{ name: scanPath, mtime: 1_795_261_566 }], {
      ...metadata,
      progver: 'v5.30.1',
    });

    await expect(scanDisk(scanPath)).rejects.toThrow(/upgrade|newer/i);
  });

  it('rejects excessive nesting with a resource-limit error', async () => {
    let nested: unknown = { name: 'file', dsize: 0 };
    for (let depth = 0; depth < 257; depth++) {
      nested = [{ name: 'nested', dsize: 0 }, nested];
    }
    await setFakeExport([{ name: scanPath, dsize: 0 }, nested]);

    await expect(scanDisk(scanPath)).rejects.toThrow(/too deep/i);
  });

  it('explains how to configure a missing executable', async () => {
    vi.stubEnv('SERVERMON_GDU_PATH', path.join(fixtureDir, 'missing'));

    await expect(scanDisk(scanPath)).rejects.toThrow(/install.*dundee\/gdu.*SERVERMON_GDU_PATH/i);
  });

  it('identifies GNU du in place of dundee/gdu', async () => {
    await setFakeExecutable(
      `process.stderr.write("gdu: invalid option -- 'o'\\nTry 'gdu --help' for more information.");
       process.exitCode = 1;`
    );

    await expect(scanDisk(scanPath)).rejects.toThrow(/dundee\/gdu.*GNU du/i);
  });

  it('returns a user-facing message without raw process diagnostics', async () => {
    await setFakeExecutable(
      `process.stderr.write('internal details at /private'); process.exitCode = 1;`
    );

    const error = await scanDisk(scanPath).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DiskScanError);
    expect(String(error)).not.toContain('/private');
  });
});
