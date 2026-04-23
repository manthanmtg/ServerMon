/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';

type ExecFileResult = { stdout?: string; stderr?: string };
type ExecFileCallback = (error: Error | null, result: ExecFileResult | null) => void;
type ExecFileImplementation = (...args: [...unknown[], ExecFileCallback]) => void;
type MockStatResult = {
  isFile: () => boolean;
  isDirectory: () => boolean;
  mode: number;
  mtime: Date;
  size: number;
};

const {
  execFileMock,
  accessMock,
  statMock,
  readdirMock,
  readFileMock,
  writeFileMock,
  mkdirMock,
  renameMock,
  rmMock,
  unlinkMock,
} = vi.hoisted(() => ({
  execFileMock: vi.fn<(file: string, args: string[], callback: ExecFileCallback) => void>(),
  accessMock: vi.fn<(path: string, mode?: number) => Promise<void>>(),
  statMock: vi.fn<(path: string) => Promise<MockStatResult>>(),
  readdirMock: vi.fn<(path: string) => Promise<string[]>>(),
  readFileMock: vi.fn<(path: string) => Promise<Buffer>>(),
  writeFileMock: vi.fn<(path: string, data: string, encoding: string) => Promise<void>>(),
  mkdirMock: vi.fn<(path: string) => Promise<void>>(),
  renameMock: vi.fn<(oldPath: string, newPath: string) => Promise<void>>(),
  rmMock: vi.fn<(path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>>(),
  unlinkMock: vi.fn<(path: string) => Promise<void>>(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

// Mock util — promisify wraps execFile into async
vi.mock('util', async (importOriginal) => {
  const original = await importOriginal<typeof import('util')>();
  return {
    ...original,
    promisify: vi.fn((fn) => {
      if (fn === execFile) {
        return async (file: string, args: string[]) => {
          return await new Promise((resolve, reject) => {
            execFileMock(file, args, (err: Error | null, out: unknown) => {
              if (err) reject(err);
              else resolve(out);
            });
          });
        };
      }
      return original.promisify(fn);
    }),
  };
});

// Mock fs/promises
vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>();
  return {
    ...original,
    constants: original.constants,
    createReadStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
    promises: {
      access: accessMock,
      stat: statMock,
      readdir: readdirMock,
      readFile: readFileMock,
      writeFile: writeFileMock,
      mkdir: mkdirMock,
      rename: renameMock,
      rm: rmMock,
      unlink: unlinkMock,
      open: vi.fn(),
    },
  };
});

// Mock os
vi.mock('os', () => ({
  default: {
    homedir: vi.fn().mockReturnValue('/home/user'),
  },
  __esModule: true,
}));

import {
  resolveBrowserPath,
  formatPermissions,
  formatBytes,
  FileBrowserError,
  listDirectory,
  readTree,
  previewFile,
  readEditableFile,
  saveFile,
  createEntry,
  renameEntry,
  deleteEntry,
  matchesFilter,
  defaultShortcuts,
  gitStage,
  gitUnstage,
  gitStageAll,
  gitUnstageAll,
  gitDiscardFile,
  gitDiscardAll,
  gitCheckout,
  gitFetch,
  gitCommit,
  gitPull,
} from './file-browser';

function mockExecFile(impl: ExecFileImplementation) {
  execFileMock.mockImplementation(impl);
}

function resolveStat(value: MockStatResult) {
  statMock.mockResolvedValue(value);
}

function rejectStat(error: Error) {
  statMock.mockRejectedValue(error);
}

function resolveAccess() {
  accessMock.mockResolvedValue(undefined);
}

function rejectAccess(error: Error) {
  accessMock.mockRejectedValue(error);
}

function resolveReaddir(value: string[]) {
  readdirMock.mockResolvedValue(value);
}

function resolveReadFile(value: Buffer) {
  readFileMock.mockResolvedValue(value);
}

function resolveWriteFile() {
  writeFileMock.mockResolvedValue(undefined);
}

function resolveMkdir() {
  mkdirMock.mockResolvedValue(undefined);
}

function resolveRename() {
  renameMock.mockResolvedValue(undefined);
}

function resolveRm() {
  rmMock.mockResolvedValue(undefined);
}

function resolveUnlink() {
  unlinkMock.mockResolvedValue(undefined);
}

function makeStatFile(overrides: Partial<{ size: number; mode: number; mtime: Date }> = {}) {
  return {
    isFile: () => true,
    isDirectory: () => false,
    mode: overrides.mode ?? 0o644,
    mtime: overrides.mtime ?? new Date('2026-01-01T00:00:00Z'),
    size: overrides.size ?? 100,
  };
}

function makeStatDir(overrides: Partial<{ mode: number; mtime: Date }> = {}) {
  return {
    isFile: () => false,
    isDirectory: () => true,
    mode: overrides.mode ?? 0o755,
    mtime: overrides.mtime ?? new Date('2026-01-01T00:00:00Z'),
    size: 0,
  };
}

// git execFile that returns "not a repo" error
function noGitImpl(...args: unknown[]) {
  const cb = args.pop() as ExecFileCallback;
  cb(new Error('not a git repository'), null);
}

describe('file-browser extra tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── resolveBrowserPath ────────────────────────────────────────────────────

  describe('resolveBrowserPath', () => {
    it('resolves ~ to homedir', () => {
      expect(resolveBrowserPath('~')).toBe('/home/user');
    });

    it('throws FileBrowserError for empty path', () => {
      expect(() => resolveBrowserPath('')).toThrow(FileBrowserError);
      expect(() => resolveBrowserPath('')).toThrow('Path is required');
    });

    it('throws FileBrowserError for relative path', () => {
      expect(() => resolveBrowserPath('relative/path')).toThrow(FileBrowserError);
      expect(() => resolveBrowserPath('relative/path')).toThrow('absolute');
    });

    it('resolves ~/subdir to homedir/subdir', () => {
      expect(resolveBrowserPath('~/docs')).toBe('/home/user/docs');
    });
  });

  // ─── formatPermissions ────────────────────────────────────────────────────

  describe('formatPermissions', () => {
    it('formats 0o644 as rw-r--r--', () => {
      expect(formatPermissions(0o644)).toBe('rw-r--r--');
    });

    it('formats 0o777 as rwxrwxrwx', () => {
      expect(formatPermissions(0o777)).toBe('rwxrwxrwx');
    });

    it('formats 0o000 as ---------', () => {
      expect(formatPermissions(0o000)).toBe('---------');
    });
  });

  // ─── formatBytes ──────────────────────────────────────────────────────────

  describe('formatBytes', () => {
    it('returns bytes for values under 1024', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('returns KB for values in kilobyte range', () => {
      expect(formatBytes(1024)).toBe('1 KB');
    });

    it('returns MB for values in megabyte range', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    });

    it('returns GB for values in gigabyte range', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    });

    it('returns TB for very large values', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB');
    });

    it('shows one decimal for small MB', () => {
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    });

    it('shows no decimal for 10+ MB', () => {
      expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
    });
  });

  // ─── FileBrowserError ─────────────────────────────────────────────────────

  describe('FileBrowserError', () => {
    it('has name FileBrowserError', () => {
      const err = new FileBrowserError('test');
      expect(err.name).toBe('FileBrowserError');
    });

    it('uses default status of 400', () => {
      const err = new FileBrowserError('bad request');
      expect(err.status).toBe(400);
    });

    it('accepts custom status codes', () => {
      const err = new FileBrowserError('not found', 404);
      expect(err.status).toBe(404);
      expect(err.message).toBe('not found');
    });
  });

  // ─── listDirectory ────────────────────────────────────────────────────────

  describe('listDirectory', () => {
    it('throws 404 when stat fails', async () => {
      rejectStat(new Error('ENOENT'));
      mockExecFile(noGitImpl);

      await expect(listDirectory('/nonexistent')).rejects.toThrow(FileBrowserError);
    });

    it('throws 400 when path is not a directory', async () => {
      resolveStat(makeStatFile());
      mockExecFile(noGitImpl);

      await expect(listDirectory('/some/file.txt')).rejects.toThrow('not a directory');
    });

    it('returns directory listing with summary', async () => {
      resolveStat(makeStatDir());
      resolveReaddir([]);
      mockExecFile(noGitImpl);

      const result = await listDirectory('/home/user');
      expect(result.path).toBe('/home/user');
      expect(result.entries).toEqual([]);
      expect(result.summary.directories).toBe(0);
      expect(result.summary.files).toBe(0);
      expect(result.git).toBeNull();
    });

    it('sorts directories before files', async () => {
      const dirStat = makeStatDir();
      const fileStat = makeStatFile({ size: 100 });

      // stat is called for each entry
      let callCount = 0;
      statMock.mockImplementation((p: string) => {
        if (callCount === 0) {
          callCount++;
          return Promise.resolve(dirStat); // parent dir
        }
        if (p.includes('afile')) return Promise.resolve(fileStat);
        return Promise.resolve(dirStat);
      });
      resolveAccess();
      resolveReaddir(['afile.txt', 'zdir']);
      mockExecFile(noGitImpl);

      const result = await listDirectory('/home/user');
      // Directory should come before file in sorted order
      const dirEntry = result.entries.find((e) => e.isDirectory);
      const fileEntry = result.entries.find((e) => !e.isDirectory);
      if (dirEntry && fileEntry) {
        expect(result.entries.indexOf(dirEntry)).toBeLessThan(result.entries.indexOf(fileEntry));
      }
    });

    it('parentPath is null for root directory', async () => {
      resolveStat(makeStatDir());
      resolveReaddir([]);
      mockExecFile(noGitImpl);

      const result = await listDirectory('/');
      expect(result.parentPath).toBeNull();
    });
  });

  // ─── readTree ─────────────────────────────────────────────────────────────

  describe('readTree', () => {
    it('throws 404 when target not found', async () => {
      rejectStat(new Error('ENOENT'));

      await expect(readTree('/nonexistent')).rejects.toThrow(FileBrowserError);
    });

    it('throws 400 when path is not a directory', async () => {
      resolveStat(makeStatFile());

      await expect(readTree('/some/file.txt')).rejects.toThrow('not a directory');
    });

    it('returns tree node for empty directory', async () => {
      resolveStat(makeStatDir());
      resolveReaddir([]);

      const result = await readTree('/home/user', 2);
      expect(result.path).toBe('/home/user');
      expect(result.isDirectory).toBe(true);
      expect(result.hasChildren).toBe(false);
      expect(result.children).toEqual([]);
    });

    it('sets hasChildren=true when directory has entries at depth 0', async () => {
      resolveStat(makeStatDir());

      const result = await readTree('/home/user', 0);
      expect(result.isDirectory).toBe(true);
      expect(result.hasChildren).toBe(true);
      expect(result.children).toBeUndefined();
    });
  });

  // ─── previewFile ──────────────────────────────────────────────────────────

  describe('previewFile', () => {
    it('throws 404 when file not found', async () => {
      rejectStat(new Error('ENOENT'));

      await expect(previewFile('/missing.txt', 1000)).rejects.toThrow(FileBrowserError);
    });

    it('throws 400 when path is a directory', async () => {
      resolveStat(makeStatDir());

      await expect(previewFile('/some/dir', 1000)).rejects.toThrow('not a file');
    });

    it('returns base64 content for image files', async () => {
      resolveStat(makeStatFile({ size: 50 }));
      resolveAccess();
      resolveReadFile(Buffer.from('fake-png-data'));

      const result = await previewFile('/home/user/photo.png', 1000);
      expect(result.kind).toBe('image');
      expect(result.encoding).toBe('base64');
      expect(result.content).toBe(Buffer.from('fake-png-data').toString('base64'));
    });

    it('returns tailLines for log files', async () => {
      resolveStat(makeStatFile({ size: 100 }));
      resolveAccess();
      const logContent = 'line1\nline2\nline3\n';
      resolveReadFile(Buffer.from(logContent));

      const result = await previewFile('/home/user/app.log', 1000);
      expect(result.kind).toBe('log');
      expect(result.tailLines).toBeDefined();
      expect(result.tailLines?.length).toBeGreaterThan(0);
    });

    it('returns no content for binary files', async () => {
      resolveStat(makeStatFile({ size: 8 }));
      resolveAccess();
      // Buffer with null bytes looks binary
      const binaryBuf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      resolveReadFile(binaryBuf);

      const result = await previewFile('/home/user/data.bin', 1000);
      expect(result.content).toBeUndefined();
    });

    it('marks content as truncated when larger than previewMaxBytes', async () => {
      resolveStat(makeStatFile({ size: 5000 }));
      resolveAccess();
      resolveReadFile(Buffer.from('a'.repeat(5000)));

      const result = await previewFile('/home/user/big.txt', 100);
      expect(result.truncated).toBe(true);
      expect(result.content?.length).toBeLessThanOrEqual(100);
    });
  });

  // ─── readEditableFile ─────────────────────────────────────────────────────

  describe('readEditableFile', () => {
    it('returns preview for editable text file', async () => {
      resolveStat(makeStatFile({ size: 50 }));
      resolveAccess();
      resolveReadFile(Buffer.from('Hello World'));

      const result = await readEditableFile('/home/user/file.txt', 10000);
      expect(result.content).toBe('Hello World');
    });

    it('throws for image files (not editable as text)', async () => {
      resolveStat(makeStatFile({ size: 50 }));
      resolveAccess();
      resolveReadFile(Buffer.from('fake-png'));

      await expect(readEditableFile('/home/user/photo.png', 10000)).rejects.toThrow(
        'not editable as text'
      );
    });

    it('throws when file exceeds maxBytes', async () => {
      resolveStat(makeStatFile({ size: 5000 }));
      resolveAccess();
      resolveReadFile(Buffer.from('a'.repeat(5000)));

      await expect(readEditableFile('/home/user/big.txt', 100)).rejects.toThrow('exceeds editor limit');
    });
  });

  // ─── saveFile ─────────────────────────────────────────────────────────────

  describe('saveFile', () => {
    it('writes content to file', async () => {
      resolveStat(makeStatFile());
      resolveWriteFile();

      await saveFile('/home/user/file.txt', 'new content');
      expect(fs.writeFile).toHaveBeenCalledWith('/home/user/file.txt', 'new content', 'utf8');
    });

    it('throws 404 when file not found', async () => {
      rejectStat(new Error('ENOENT'));

      await expect(saveFile('/missing.txt', 'content')).rejects.toThrow(FileBrowserError);
    });

    it('throws 400 when path is a directory', async () => {
      resolveStat(makeStatDir());

      await expect(saveFile('/some/dir', 'content')).rejects.toThrow('not a file');
    });
  });

  // ─── createEntry ──────────────────────────────────────────────────────────

  describe('createEntry', () => {
    it('creates a file', async () => {
      rejectAccess(new Error('ENOENT'));
      resolveWriteFile();

      const result = await createEntry('/home/user', 'newfile.txt', 'file', 'hello');
      expect(result).toBe('/home/user/newfile.txt');
      expect(fs.writeFile).toHaveBeenCalledWith('/home/user/newfile.txt', 'hello', 'utf8');
    });

    it('creates a directory', async () => {
      rejectAccess(new Error('ENOENT'));
      resolveMkdir();

      const result = await createEntry('/home/user', 'newdir', 'directory');
      expect(result).toBe('/home/user/newdir');
      expect(fs.mkdir).toHaveBeenCalledWith('/home/user/newdir');
    });

    it('throws 409 when entry already exists', async () => {
      resolveAccess();

      await expect(createEntry('/home/user', 'existing.txt', 'file')).rejects.toThrow(
        'already exists'
      );
    });

    it('throws 400 for invalid names', async () => {
      await expect(createEntry('/home/user', '.', 'file')).rejects.toThrow('Valid name required');
      await expect(createEntry('/home/user', '..', 'file')).rejects.toThrow('Valid name required');
    });
  });

  // ─── renameEntry ──────────────────────────────────────────────────────────

  describe('renameEntry', () => {
    it('renames a file', async () => {
      resolveRename();

      const result = await renameEntry('/home/user/old.txt', 'new.txt');
      expect(result).toBe('/home/user/new.txt');
      expect(fs.rename).toHaveBeenCalledWith('/home/user/old.txt', '/home/user/new.txt');
    });

    it('throws 400 for invalid new name', async () => {
      await expect(renameEntry('/home/user/file.txt', '.')).rejects.toThrow('Valid name required');
    });
  });

  // ─── deleteEntry ──────────────────────────────────────────────────────────

  describe('deleteEntry', () => {
    it('deletes a file', async () => {
      resolveStat(makeStatFile());
      resolveUnlink();

      await deleteEntry('/home/user/file.txt');
      expect(fs.unlink).toHaveBeenCalledWith('/home/user/file.txt');
    });

    it('deletes a directory recursively', async () => {
      resolveStat(makeStatDir());
      resolveRm();

      await deleteEntry('/home/user/mydir');
      expect(fs.rm).toHaveBeenCalledWith('/home/user/mydir', { recursive: true, force: true });
    });

    it('throws 404 when entry not found', async () => {
      rejectStat(new Error('ENOENT'));

      await expect(deleteEntry('/missing')).rejects.toThrow(FileBrowserError);
    });
  });

  // ─── matchesFilter ────────────────────────────────────────────────────────

  describe('matchesFilter', () => {
    it('returns true when filter is empty', () => {
      expect(matchesFilter('anything.txt', '')).toBe(true);
      expect(matchesFilter('anything.txt', '   ')).toBe(true);
    });

    it('matches exact substrings (case insensitive)', () => {
      expect(matchesFilter('MyFile.txt', 'file')).toBe(true);
      expect(matchesFilter('MyFile.txt', 'FILE')).toBe(true);
    });

    it('supports * wildcard', () => {
      expect(matchesFilter('index.ts', '*.ts')).toBe(true);
      expect(matchesFilter('index.js', '*.ts')).toBe(false);
    });

    it('supports ? wildcard', () => {
      expect(matchesFilter('file1.txt', 'file?.txt')).toBe(true);
      expect(matchesFilter('file12.txt', 'file?.txt')).toBe(false);
    });

    it('returns false for non-matching pattern', () => {
      expect(matchesFilter('server.ts', '*.js')).toBe(false);
    });
  });

  // ─── defaultShortcuts ─────────────────────────────────────────────────────

  describe('defaultShortcuts', () => {
    it('returns shortcuts array with root and home', () => {
      const shortcuts = defaultShortcuts();
      expect(shortcuts).toHaveLength(2);
      expect(shortcuts.find((s) => s.id === 'root')).toBeDefined();
      expect(shortcuts.find((s) => s.id === 'home')).toBeDefined();
    });

    it('home shortcut uses os.homedir()', () => {
      const shortcuts = defaultShortcuts();
      const home = shortcuts.find((s) => s.id === 'home');
      expect(home?.path).toBe('/home/user');
    });
  });

  // ─── Git operations ───────────────────────────────────────────────────────

  describe('gitStage', () => {
    it('calls git add for the file', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string }) => void;
        cb(null, { stdout: '' });
      });
      await gitStage('/repo', 'src/index.ts');
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['-C', '/repo', 'add', '--', 'src/index.ts'],
        expect.any(Function)
      );
    });
  });

  describe('gitUnstage', () => {
    it('calls git reset HEAD for the file', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string }) => void;
        cb(null, { stdout: '' });
      });
      await gitUnstage('/repo', 'src/index.ts');
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['-C', '/repo', 'reset', 'HEAD', '--', 'src/index.ts'],
        expect.any(Function)
      );
    });
  });

  describe('gitStageAll', () => {
    it('calls git add -A', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string }) => void;
        cb(null, { stdout: '' });
      });
      await gitStageAll('/repo');
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['-C', '/repo', 'add', '-A'],
        expect.any(Function)
      );
    });
  });

  describe('gitUnstageAll', () => {
    it('calls git reset HEAD', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string }) => void;
        cb(null, { stdout: '' });
      });
      await gitUnstageAll('/repo');
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['-C', '/repo', 'reset', 'HEAD'],
        expect.any(Function)
      );
    });
  });

  describe('gitDiscardFile', () => {
    it('calls git checkout -- for the file', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string }) => void;
        cb(null, { stdout: '' });
      });
      await gitDiscardFile('/repo', 'src/index.ts');
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['-C', '/repo', 'checkout', '--', 'src/index.ts'],
        expect.any(Function)
      );
    });
  });

  describe('gitDiscardAll', () => {
    it('calls git checkout and clean', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string }) => void;
        cb(null, { stdout: '' });
      });
      await gitDiscardAll('/repo');
      expect(execFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('gitCheckout', () => {
    it('calls git checkout branch', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string }) => void;
        cb(null, { stdout: '' });
      });
      await gitCheckout('/repo', 'feature-branch');
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['-C', '/repo', 'checkout', 'feature-branch'],
        expect.any(Function)
      );
    });
  });

  describe('gitFetch', () => {
    it('returns combined stdout and stderr', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string; stderr: string }) => void;
        cb(null, { stdout: 'Fetching origin\n', stderr: '' });
      });
      const result = await gitFetch('/repo');
      expect(result).toBe('Fetching origin');
    });
  });

  describe('gitCommit', () => {
    it('returns commit output', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string }) => void;
        cb(null, { stdout: '[main abc123] My commit\n' });
      });
      const result = await gitCommit('/repo', 'My commit');
      expect(result).toBe('[main abc123] My commit');
    });
  });

  describe('gitPull', () => {
    it('returns pull output', async () => {
      mockExecFile((...args: unknown[]) => {
        const cb = args.pop() as (err: null, out: { stdout: string; stderr: string }) => void;
        cb(null, { stdout: 'Already up to date.\n', stderr: '' });
      });
      const result = await gitPull('/repo');
      expect(result).toBe('Already up to date.');
    });
  });
});
