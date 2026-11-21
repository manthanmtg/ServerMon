// @vitest-environment node
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDiskEntry, isCleanupPath, prepareDiskDeletion } from './cleanup';

let fixture: string;
let root: string;
let outside: string;

beforeEach(async () => {
  fixture = await mkdtemp(join(await realpath(tmpdir()), 'servermon-cleanup-'));
  root = join(fixture, 'allowed');
  outside = join(fixture, 'elsewhere');
  await Promise.all([mkdir(root), mkdir(outside)]);
  vi.stubEnv('SERVERMON_DISK_CLEANUP_ROOTS', JSON.stringify([root]));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(fixture, { recursive: true, force: true });
});

describe('isCleanupPath', () => {
  it('allows strict descendants and protects configured roots even inside another root', () => {
    const nestedRoot = join(root, 'projects', 'protected');
    vi.stubEnv('SERVERMON_DISK_CLEANUP_ROOTS', JSON.stringify(['/', root, nestedRoot]));

    expect(isCleanupPath(join(root, 'data'))).toBe(true);
    expect(isCleanupPath(join(nestedRoot, 'data'))).toBe(true);
    expect(isCleanupPath(root)).toBe(false);
    expect(isCleanupPath(nestedRoot)).toBe(false);
    expect(isCleanupPath(join(root, 'projects'))).toBe(false);
    expect(isCleanupPath(`${root}-other/data`)).toBe(false);
    expect(isCleanupPath(`${root}/../elsewhere/file`)).toBe(false);
    expect(isCleanupPath(join(outside, 'file'))).toBe(false);
  });

  it.each(['not json', '{}', '["/"]', '["relative"]'])(
    'disables cleanup for unsafe allowlist %s',
    (value) => {
      vi.stubEnv('SERVERMON_DISK_CLEANUP_ROOTS', value);
      expect(isCleanupPath(join(root, 'file'))).toBe(false);
    }
  );

  it('disables cleanup when an allowlist includes a non-path item', () => {
    vi.stubEnv('SERVERMON_DISK_CLEANUP_ROOTS', JSON.stringify([root, 3]));
    expect(isCleanupPath(join(root, 'file'))).toBe(false);
  });
});

describe('default cleanup scope', () => {
  beforeEach(() => {
    vi.stubEnv('SERVERMON_DISK_CLEANUP_ROOTS', '');
  });

  it.each([
    '/var/cache/apt/archives',
    '/var/log/app.log',
    '/var/tmp/session.tmp',
    '/var/crash/core.dump',
    '/var/backups/db.sql',
    '/opt/app/data',
    '/srv/deployments/app',
    '/tmp/build/cache',
    '/media/usb/staging',
  ])('allows cleaning %s', (targetPath) => {
    expect(isCleanupPath(targetPath)).toBe(true);
  });

  it.each([
    '/',
    '/etc',
    '/etc/nginx/nginx.conf',
    '/usr',
    '/usr/bin/ls',
    '/bin/sh',
    '/boot/vmlinuz',
    '/var/lib/docker',
    '/var/db',
    '/var/spool/mail',
    '/var',
    '/home',
    '/home/alice',
    '/root/.ssh',
    '/proc/1',
    '/swapfile',
  ])('protects %s', (targetPath) => {
    expect(isCleanupPath(targetPath)).toBe(false);
  });

  it('deletes an eligible file without any configuration', async () => {
    const file = join(root, 'file');
    await writeFile(file, 'data');

    const { identity } = await prepareDiskDeletion(file, 'file');
    await deleteDiskEntry(file, 'file', identity);

    await expect(lstat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('deletes an eligible nested directory without any configuration', async () => {
    const folder = join(root, 'folder');
    await mkdir(join(folder, 'nested'), { recursive: true });
    await writeFile(join(folder, 'nested', 'file'), 'data');

    const { identity } = await prepareDiskDeletion(folder, 'directory');
    await deleteDiskEntry(folder, 'directory', identity);

    await expect(lstat(folder)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('guarded disk deletion', () => {
  it('deletes an approved nested regular file', async () => {
    const folder = join(root, 'nested');
    const file = join(folder, '--name with spaces\n.txt');
    await mkdir(folder);
    await writeFile(file, 'data');

    const { identity } = await prepareDiskDeletion(file, 'file');
    await deleteDiskEntry(file, 'file', identity);

    await expect(lstat(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await lstat(folder)).isDirectory()).toBe(true);
  });

  it('recursively deletes a directory without following links within it', async () => {
    const folder = join(root, 'folder');
    const nested = join(folder, 'nested');
    const kept = join(outside, 'keep');
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, 'remove'), 'data');
    await writeFile(kept, 'keep');
    await symlink(outside, join(nested, 'external'));

    const { identity } = await prepareDiskDeletion(folder, 'directory');
    await deleteDiskEntry(folder, 'directory', identity);

    await expect(lstat(folder)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(kept, 'utf8')).resolves.toBe('keep');
  });

  it('rejects symlinks as targets and as ancestors of targets', async () => {
    const file = join(outside, 'file');
    await writeFile(file, 'keep');
    await symlink(file, join(root, 'linked-file'));
    await symlink(outside, join(root, 'linked-folder'));

    await expect(prepareDiskDeletion(join(root, 'linked-file'), 'file')).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      prepareDiskDeletion(join(root, 'linked-folder'), 'directory')
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      prepareDiskDeletion(join(root, 'linked-folder', 'file'), 'file')
    ).rejects.toMatchObject({ status: 403 });
    await expect(readFile(file, 'utf8')).resolves.toBe('keep');
  });

  it('rejects an allowlisted path whose configured ancestor is a symlink', async () => {
    const file = join(outside, 'nested', 'file');
    const alias = join(fixture, 'alias');
    await mkdir(join(outside, 'nested'));
    await writeFile(file, 'keep');
    await symlink(outside, alias);
    vi.stubEnv('SERVERMON_DISK_CLEANUP_ROOTS', JSON.stringify([join(alias, 'nested')]));

    await expect(prepareDiskDeletion(join(alias, 'nested', 'file'), 'file')).rejects.toMatchObject({
      status: 403,
    });
    await expect(readFile(file, 'utf8')).resolves.toBe('keep');
  });

  it('rejects an existing replacement at an approved path', async () => {
    const file = join(root, 'file');
    await writeFile(file, 'original');
    const { identity } = await prepareDiskDeletion(file, 'file');
    await rename(file, join(root, 'original'));
    await writeFile(file, 'replacement');

    await expect(deleteDiskEntry(file, 'file', identity)).rejects.toMatchObject({ status: 409 });
    await expect(readFile(file, 'utf8')).resolves.toBe('replacement');
  });

  it('checks descendant changes and reports live usage before confirming a folder deletion', async () => {
    const folder = join(root, 'folder');
    const nested = join(folder, 'nested');
    const file = join(nested, 'file');
    await mkdir(nested, { recursive: true });
    await writeFile(file, 'original');

    const { identity, size, modifiedAt } = await prepareDiskDeletion(folder, 'directory');
    const info = await lstat(file);
    expect(size).toBeGreaterThanOrEqual(info.blocks * 512);
    expect(modifiedAt).toBeGreaterThanOrEqual(Math.floor(info.mtimeMs / 1000));
    await writeFile(file, 'replacement inside the nested folder');

    await expect(deleteDiskEntry(folder, 'directory', identity)).rejects.toMatchObject({
      status: 409,
    });
    await expect(readFile(file, 'utf8')).resolves.toEqual('replacement inside the nested folder');
  });

  it('binds approval to the exact entry even when another path is a hard link', async () => {
    const file = join(root, 'file');
    const alias = join(root, 'alias');
    await writeFile(file, 'data');
    await link(file, alias);
    const { identity } = await prepareDiskDeletion(file, 'file');

    await expect(deleteDiskEntry(alias, 'file', identity)).rejects.toMatchObject({ status: 409 });
    await expect(readFile(alias, 'utf8')).resolves.toBe('data');
  });

  it('rejects a parent replaced by a symlink after approval', async () => {
    const folder = join(root, 'folder');
    const file = join(folder, 'file');
    const kept = join(outside, 'file');
    await mkdir(folder);
    await writeFile(file, 'data');
    await writeFile(kept, 'keep');
    const { identity } = await prepareDiskDeletion(file, 'file');
    await rename(folder, join(root, 'original'));
    await symlink(outside, folder);

    await expect(deleteDiskEntry(file, 'file', identity)).rejects.toMatchObject({ status: 403 });
    await expect(readFile(kept, 'utf8')).resolves.toBe('keep');
  });
});
