import { execFile } from 'node:child_process';
import { posix } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const execFileAsync = promisify(execFile);
const CLEANUP_TIMEOUT_MS = 30_000;

type CleanupKind = 'file' | 'directory';

const liveEntrySchema = z.object({
  identity: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  modifiedAt: z.number().int(),
});

export class DiskCleanupError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'DiskCleanupError';
  }
}

function absolutePath(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !posix.isAbsolute(value) ||
    value.includes('\0') ||
    value.split('/').some((part) => part === '.' || part === '..')
  ) {
    return null;
  }

  return posix.normalize(value).replace(/\/$/, '') || '/';
}

function isDescendant(parent: string, child: string): boolean {
  return child.startsWith(`${parent}/`);
}

function getCleanupPath(targetPath: string) {
  const target = absolutePath(targetPath);
  if (!target || target === '/') return null;

  let configured: unknown;
  try {
    configured = JSON.parse(process.env.SERVERMON_DISK_CLEANUP_ROOTS ?? '[]');
  } catch {
    return null;
  }
  if (!Array.isArray(configured)) return null;

  const roots: string[] = [];
  for (const value of configured) {
    const root = absolutePath(value);
    if (!root) return null;
    if (root === '/') continue;
    // Deleting an ancestor would also delete the configured root.
    if (target === root || isDescendant(target, root)) return null;
    roots.push(root);
  }

  const matchingRoot = roots.reduce<string | undefined>((longest, root) => {
    if (!isDescendant(root, target)) return longest;
    return !longest || root.length > longest.length ? root : longest;
  }, undefined);

  return matchingRoot ? { target, root: matchingRoot, roots: [...new Set(roots)] } : null;
}

/** Lexical eligibility for display. Live filesystem checks run before prepare and delete. */
export function isCleanupPath(targetPath: string): boolean {
  return getCleanupPath(targetPath) !== null;
}

// POSIX directory-relative operations keep the walker on opened directory
// descriptors, with no symlink resolution or shell interpolation. Inline code
// lets Next's standalone distribution carry the worker with its API route.
const CLEANUP_WORKER = String.raw`
import errno
import hashlib
import json
import os
import stat
import sys
from contextlib import ExitStack, contextmanager

action, path, root, roots_json, kind, expected = sys.argv[1:]
directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
linux = sys.platform == 'linux'

class Forbidden(Exception):
    pass

class Changed(Exception):
    pass

class RemovalInterrupted(Exception):
    pass

def entry_stat(parent, name):
    return os.stat(name, dir_fd=parent, follow_symlinks=False)

def inode(info):
    return (info.st_dev, info.st_ino)

def version(info):
    return (*inode(info), info.st_mode, info.st_ctime_ns, info.st_mtime_ns, info.st_size)

def filesystem(fd, info):
    if linux:
        # Device numbers alone cannot distinguish same-device bind mounts.
        with open('/proc/self/fdinfo/' + str(fd), encoding='ascii') as fd_info:
            for line in fd_info:
                if line.startswith('mnt_id:'):
                    return (info.st_dev, int(line.split()[1]))
        raise Forbidden()
    return (info.st_dev,)

@contextmanager
def open_directory(parent, name):
    before = entry_stat(parent, name)
    if stat.S_ISLNK(before.st_mode):
        raise Forbidden()
    if not stat.S_ISDIR(before.st_mode):
        raise Changed()
    fd = os.open(name, directory_flags, dir_fd=parent)
    try:
        info = os.fstat(fd)
        if inode(info) != inode(before):
            raise Changed()
        yield (fd, info)
    finally:
        os.close(fd)

def check_leaf(parent, name, before, allowed_fs):
    if linux:
        fd = os.open(name, os.O_PATH | os.O_NOFOLLOW, dir_fd=parent)
        try:
            current = os.fstat(fd)
            if version(current) != version(before):
                raise Changed()
            if filesystem(fd, current) != allowed_fs:
                raise Forbidden()
        finally:
            os.close(fd)
    elif (before.st_dev,) != allowed_fs:
        raise Forbidden()

def assert_anchored(links):
    # Check that every opened directory still occupies its original parent
    # entry before mutating through the chain.
    for parent, name, info in links:
        if inode(entry_stat(parent, name)) != inode(info):
            raise Changed()

def protected_inodes(slash):
    # The same directory may have another spelling on a case-insensitive
    # filesystem. Protect the configured directories and all their ancestors.
    protected = set()
    for configured in json.loads(roots_json):
        parent = slash
        with ExitStack() as opened:
            for name in configured[1:].split('/'):
                try:
                    parent, info = opened.enter_context(open_directory(parent, name))
                except (Forbidden, Changed, FileNotFoundError, PermissionError):
                    break
                protected.add(inode(info))
    return protected

def inspect_entry(parent, name, before, fd, allowed_fs, protected, digest, hardlinks):
    digest.update(json.dumps([name, version(before)]).encode('ascii'))
    modified = before.st_mtime_ns // 1_000_000_000
    size = before.st_blocks * 512
    if fd is None:
        check_leaf(parent, name, before, allowed_fs)
        if before.st_nlink > 1:
            key = inode(before)
            if key in hardlinks:
                size = 0
            hardlinks.add(key)
        return size, modified
    if inode(before) in protected or filesystem(fd, before) != allowed_fs:
        raise Forbidden()
    for child_name in sorted(os.listdir(fd)):
        child = entry_stat(fd, child_name)
        if stat.S_ISDIR(child.st_mode):
            with open_directory(fd, child_name) as (child_fd, info):
                if version(info) != version(child):
                    raise Changed()
                child_size, child_modified = inspect_entry(fd, child_name, info, child_fd, allowed_fs, protected, digest, hardlinks)
        else:
            child_size, child_modified = inspect_entry(fd, child_name, child, None, allowed_fs, protected, digest, hardlinks)
        size += child_size
        modified = max(modified, child_modified)
    if version(os.fstat(fd)) != version(before):
        raise Changed()
    return size, modified

def remove_directory(parent, name, fd, before, links, allowed_fs, protected):
    if inode(before) in protected:
        raise Forbidden()
    if filesystem(fd, before) != allowed_fs:
        raise Forbidden()
    links = [*links, (parent, name, before)]
    with os.scandir(fd) as entries:
        for entry in entries:
            child = entry_stat(fd, entry.name)
            if stat.S_ISDIR(child.st_mode):
                with open_directory(fd, entry.name) as (child_fd, info):
                    if inode(info) != inode(child):
                        raise Changed()
                    remove_directory(fd, entry.name, child_fd, info, links, allowed_fs, protected)
            else:
                # unlink removes a symlink entry itself, even when it points outside.
                remove_leaf(fd, entry.name, child, links, allowed_fs)
    assert_anchored(links)
    os.rmdir(name, dir_fd=parent)

def remove_leaf(parent, name, before, links, allowed_fs):
    check_leaf(parent, name, before, allowed_fs)
    assert_anchored(links)
    if version(entry_stat(parent, name)) != version(before):
        raise Changed()
    os.unlink(name, dir_fd=parent)

def run():
    root_parts = root[1:].split('/')
    parts = path[1:].split('/')
    with ExitStack() as opened:
        slash = os.open('/', directory_flags)
        opened.callback(os.close, slash)
        parent = slash
        links = []
        allowed_fs = None
        for index, name in enumerate(parts[:-1]):
            fd, info = opened.enter_context(open_directory(parent, name))
            links.append((parent, name, info))
            parent = fd
            if index + 1 == len(root_parts):
                allowed_fs = filesystem(fd, info)
            elif allowed_fs is not None and filesystem(fd, info) != allowed_fs:
                raise Forbidden()
        if allowed_fs is None:
            raise Forbidden()

        name = parts[-1]
        before = entry_stat(parent, name)
        if stat.S_ISLNK(before.st_mode):
            raise Forbidden()
        protected = set()
        fd = None
        if kind == 'directory' and stat.S_ISDIR(before.st_mode):
            fd, info = opened.enter_context(open_directory(parent, name))
            if version(info) != version(before):
                raise Changed()
            protected = protected_inodes(slash)
            if filesystem(fd, info) != allowed_fs or inode(info) in protected:
                raise Forbidden()
        elif kind == 'file' and stat.S_ISREG(before.st_mode):
            check_leaf(parent, name, before, allowed_fs)
        else:
            raise Changed()

        assert_anchored(links)
        identity_data = [path, kind, allowed_fs, [inode(info) for _, _, info in links]]
        digest = hashlib.sha256(json.dumps(identity_data).encode('ascii'))
        size, modified = inspect_entry(parent, name, before, fd, allowed_fs, protected, digest, set())
        identity = digest.hexdigest()
        assert_anchored(links)
        if action == 'prepare':
            print(json.dumps({'identity': identity, 'size': size, 'modifiedAt': modified}))
            return
        if identity != expected or version(entry_stat(parent, name)) != version(before):
            raise Changed()
        if fd is None:
            remove_leaf(parent, name, before, links, allowed_fs)
        else:
            try:
                remove_directory(parent, name, fd, before, links, allowed_fs, protected)
            except (Forbidden, Changed, OSError) as error:
                raise RemovalInterrupted() from error

try:
    run()
except RemovalInterrupted:
    sys.exit(13)
except (Forbidden, PermissionError):
    sys.exit(10)
except (Changed, FileNotFoundError, NotADirectoryError, IsADirectoryError):
    sys.exit(11)
except OSError as error:
    if error.errno in (errno.ELOOP, errno.EBUSY, errno.EXDEV, errno.EROFS):
        sys.exit(10)
    if error.errno in (errno.ENOTEMPTY, errno.ESTALE):
        sys.exit(11)
    sys.exit(12)
`;

async function runCleanup(
  action: 'prepare' | 'delete',
  targetPath: string,
  kind: CleanupKind,
  identity = ''
): Promise<string> {
  const match = getCleanupPath(targetPath);
  if (!match) {
    throw new DiskCleanupError('This path is outside the configured disk cleanup scope.', 403);
  }
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    throw new DiskCleanupError('Disk cleanup is unavailable on this host.', 503);
  }

  try {
    const { stdout } = await execFileAsync(
      'python3',
      [
        '-I',
        '-S',
        '-c',
        CLEANUP_WORKER,
        action,
        match.target,
        match.root,
        JSON.stringify(match.roots),
        kind,
        identity,
      ],
      { timeout: CLEANUP_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 8192 }
    );
    return stdout.trim();
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 10) {
      throw new DiskCleanupError(
        'The filesystem refused cleanup or the path crosses a symlink, mount, or protected root.',
        403
      );
    }
    if (code === 11) {
      throw new DiskCleanupError('The filesystem entry changed. Rescan before trying again.', 409);
    }
    if (code === 13) {
      throw new DiskCleanupError(
        'Directory removal stopped. Some entries may have been deleted.',
        409
      );
    }
    if (code === 'ENOENT' || (error instanceof Error && 'killed' in error && error.killed)) {
      const detail = action === 'delete' ? ' Check refreshed results for any changes.' : '';
      throw new DiskCleanupError(
        'The disk cleanup helper was unavailable or timed out.' + detail,
        503
      );
    }
    throw new DiskCleanupError('Disk cleanup failed on the filesystem.', 500);
  }
}

export async function prepareDiskDeletion(targetPath: string, kind: CleanupKind) {
  const stdout = await runCleanup('prepare', targetPath, kind);
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new DiskCleanupError('The disk cleanup helper returned an invalid result.', 500);
  }
  const result = liveEntrySchema.safeParse(data);
  if (!result.success) {
    throw new DiskCleanupError('The disk cleanup helper returned an invalid result.', 500);
  }
  return result.data;
}

export async function deleteDiskEntry(
  targetPath: string,
  kind: CleanupKind,
  identity: string
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(identity)) {
    throw new DiskCleanupError('The filesystem entry changed. Rescan before trying again.', 409);
  }
  await runCleanup('delete', targetPath, kind, identity);
}
