import { constants, createReadStream } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
  '.ico',
]);
const LOG_EXTENSIONS = new Set(['.log', '.out', '.err']);
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.env',
  '.conf',
  '.cfg',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.html',
  '.xml',
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.sql',
  '.properties',
]);
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.tar', '.gz', '.tgz', '.tar.gz']);

export type FileKind = 'directory' | 'image' | 'log' | 'archive' | 'code' | 'text' | 'binary';

export interface FileBrowserEntry {
  name: string;
  path: string;
  parentPath: string;
  extension: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  permissions: string;
  canRead: boolean;
  canWrite: boolean;
  kind: FileKind;
}

export interface DirectoryListing {
  path: string;
  name: string;
  parentPath: string | null;
  entries: FileBrowserEntry[];
  summary: {
    directories: number;
    files: number;
    totalSize: number;
  };
  git: GitInfo | null;
}

export interface DirectoryTreeNode {
  name: string;
  path: string;
  children?: DirectoryTreeNode[];
  hasChildren: boolean;
  isDirectory: boolean;
}

export interface PreviewPayload {
  path: string;
  name: string;
  kind: FileKind;
  extension: string;
  size: number;
  modifiedAt: string;
  canWrite: boolean;
  permissions: string;
  content?: string;
  truncated?: boolean;
  encoding?: 'utf8' | 'base64';
  mimeType?: string;
  tailLines?: string[];
}

export interface Shortcut {
  id: string;
  label: string;
  path: string;
}

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitInfo {
  root: string;
  branch: string;
  dirty: boolean;
  changedFiles: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  branches: string[];
  remotes: string[];
  ahead: number;
  behind: number;
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  date: string;
  subject: string;
  body: string;
}

export class FileBrowserError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'FileBrowserError';
    this.status = status;
  }
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function resolveBrowserPath(input: string): string {
  const trimmed = expandHome(input.trim());
  if (!trimmed) {
    throw new FileBrowserError('Path is required', 400);
  }

  if (!path.isAbsolute(trimmed)) {
    throw new FileBrowserError('Path must be absolute', 400);
  }

  return path.resolve(trimmed);
}

export function formatPermissions(mode: number): string {
  const segments = [6, 3, 0].map((offset) => {
    const value = (mode >> offset) & 7;
    return `${value & 4 ? 'r' : '-'}${value & 2 ? 'w' : '-'}${value & 1 ? 'x' : '-'}`;
  });

  return segments.join('');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function detectKind(filePath: string, isDirectory: boolean): FileKind {
  if (isDirectory) return 'directory';

  const extension = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (LOG_EXTENSIONS.has(extension)) return 'log';
  if (ARCHIVE_EXTENSIONS.has(extension) || filePath.endsWith('.tar.gz')) return 'archive';
  if (TEXT_EXTENSIONS.has(extension)) {
    return [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.c',
      '.cc',
      '.cpp',
      '.h',
      '.hpp',
      '.css',
      '.scss',
      '.html',
      '.xml',
      '.json',
      '.yml',
      '.yaml',
      '.toml',
      '.sh',
    ].includes(extension)
      ? 'code'
      : 'text';
  }
  return 'binary';
}

async function accessFlags(targetPath: string) {
  const [canRead, canWrite] = await Promise.all([
    fs
      .access(targetPath, constants.R_OK)
      .then(() => true)
      .catch(() => false),
    fs
      .access(targetPath, constants.W_OK)
      .then(() => true)
      .catch(() => false),
  ]);

  return { canRead, canWrite };
}

async function toEntry(parentPath: string, name: string): Promise<FileBrowserEntry | null> {
  try {
    const entryPath = path.join(parentPath, name);
    const stats = await fs.stat(entryPath);
    const { canRead, canWrite } = await accessFlags(entryPath);

    return {
      name,
      path: entryPath,
      parentPath,
      extension: stats.isDirectory() ? '' : path.extname(name).toLowerCase(),
      isDirectory: stats.isDirectory(),
      size: stats.isDirectory() ? 0 : stats.size,
      modifiedAt: stats.mtime.toISOString(),
      permissions: formatPermissions(stats.mode),
      canRead,
      canWrite,
      kind: detectKind(entryPath, stats.isDirectory()),
    };
  } catch {
    return null;
  }
}

export async function listDirectory(targetPath: string): Promise<DirectoryListing> {
  const resolved = resolveBrowserPath(targetPath);
  const stats = await fs.stat(resolved).catch(() => {
    throw new FileBrowserError('Directory not found', 404);
  });

  if (!stats.isDirectory()) {
    throw new FileBrowserError('Path is not a directory', 400);
  }

  const names = await fs.readdir(resolved);
  const entryResults = await Promise.all(names.map((name) => toEntry(resolved, name)));
  const entries = entryResults.filter((entry): entry is FileBrowserEntry => entry !== null);

  entries.sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    path: resolved,
    name: path.basename(resolved) || resolved,
    parentPath: resolved === path.parse(resolved).root ? null : path.dirname(resolved),
    entries,
    summary: {
      directories: entries.filter((entry) => entry.isDirectory).length,
      files: entries.filter((entry) => !entry.isDirectory).length,
      totalSize: entries.reduce((sum, entry) => sum + entry.size, 0),
    },
    git: await detectGitInfo(resolved),
  };
}

export async function readTree(
  targetPath: string,
  depth = 2,
  maxEntries = 250
): Promise<DirectoryTreeNode> {
  const resolved = resolveBrowserPath(targetPath);
  const stats = await fs.stat(resolved).catch(() => {
    throw new FileBrowserError('Directory not found', 404);
  });

  if (!stats.isDirectory()) {
    throw new FileBrowserError('Path is not a directory', 400);
  }

  const walk = async (currentPath: string, remainingDepth: number): Promise<DirectoryTreeNode> => {
    const stats = await fs.stat(currentPath);
    const isDirectory = stats.isDirectory();

    // At max depth, we don't read children but we still need to know if it's a directory
    // for the UI to show the expansion toggle.
    let hasChildren = false;
    let children: DirectoryTreeNode[] | undefined = undefined;

    if (isDirectory) {
      if (remainingDepth > 0) {
        const subEntries = await fs.readdir(currentPath, { withFileTypes: true });
        // Include both files and directories in the tree
        hasChildren = subEntries.length > 0;

        // Sort: directories first, then files
        const sortedEntries = subEntries.sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) {
            return a.isDirectory() ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        children = await Promise.all(
          sortedEntries
            .slice(0, maxEntries)
            .map((e) => walk(path.join(currentPath, e.name), remainingDepth - 1))
        );
      } else {
        // If it's a directory at max depth, assume it might have children for the UI
        hasChildren = true;
      }
    }

    return {
      name: path.basename(currentPath) || currentPath,
      path: currentPath,
      isDirectory,
      hasChildren,
      children,
    };
  };

  return walk(resolved, Math.max(0, depth));
}

function textLooksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let suspicious = 0;
  for (const value of sample) {
    if (value === 0) return true;
    if (value < 7 || (value > 14 && value < 32)) suspicious += 1;
  }
  return suspicious / Math.max(1, sample.length) > 0.2;
}

function mimeTypeForExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const lookup: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.txt': 'text/plain; charset=utf-8',
    '.log': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.ts': 'application/typescript; charset=utf-8',
    '.yml': 'text/yaml; charset=utf-8',
    '.yaml': 'text/yaml; charset=utf-8',
  };

  return lookup[extension] || 'application/octet-stream';
}

export async function previewFile(
  targetPath: string,
  previewMaxBytes: number,
  tailLineCount = 200
): Promise<PreviewPayload> {
  const resolved = resolveBrowserPath(targetPath);
  const stats = await fs.stat(resolved).catch(() => {
    throw new FileBrowserError('File not found', 404);
  });

  if (!stats.isFile()) {
    throw new FileBrowserError('Path is not a file', 400);
  }

  const { canWrite } = await accessFlags(resolved);
  const kind = detectKind(resolved, false);
  const base: PreviewPayload = {
    path: resolved,
    name: path.basename(resolved),
    kind,
    extension: path.extname(resolved).toLowerCase(),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    canWrite,
    permissions: formatPermissions(stats.mode),
    mimeType: mimeTypeForExtension(resolved),
  };

  if (kind === 'image') {
    const data = await fs.readFile(resolved);
    return {
      ...base,
      content: data.toString('base64'),
      encoding: 'base64',
    };
  }

  const chunk = await fs.readFile(resolved);
  if (textLooksBinary(chunk)) {
    return base;
  }

  const text = chunk.toString('utf8');
  if (kind === 'log') {
    return {
      ...base,
      tailLines: text.split(/\r?\n/).slice(-tailLineCount),
      truncated: Buffer.byteLength(text) > previewMaxBytes,
    };
  }

  const trimmed = text.slice(0, previewMaxBytes);
  return {
    ...base,
    content: trimmed,
    encoding: 'utf8',
    truncated: Buffer.byteLength(text) > previewMaxBytes,
  };
}

export async function readEditableFile(
  targetPath: string,
  maxBytes: number
): Promise<PreviewPayload> {
  const preview = await previewFile(targetPath, maxBytes);
  if (!preview.content || preview.encoding !== 'utf8') {
    throw new FileBrowserError('File is not editable as text', 400);
  }
  if (preview.size > maxBytes) {
    throw new FileBrowserError(`File exceeds editor limit of ${formatBytes(maxBytes)}`, 400);
  }
  return preview;
}

export async function saveFile(targetPath: string, content: string): Promise<void> {
  const resolved = resolveBrowserPath(targetPath);
  const stats = await fs.stat(resolved).catch(() => {
    throw new FileBrowserError('File not found', 404);
  });
  if (!stats.isFile()) {
    throw new FileBrowserError('Path is not a file', 400);
  }
  await fs.writeFile(resolved, content, 'utf8');
}

export async function createEntry(
  targetDir: string,
  name: string,
  kind: 'file' | 'directory',
  content = ''
): Promise<string> {
  const resolvedDir = resolveBrowserPath(targetDir);
  const safeName = path.basename(name.trim());
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new FileBrowserError('Valid name required', 400);
  }

  const nextPath = path.join(resolvedDir, safeName);
  try {
    await fs.access(nextPath);
    throw new FileBrowserError('Entry already exists', 409);
  } catch (error) {
    if (error instanceof FileBrowserError) {
      throw error;
    }
  }

  if (kind === 'directory') {
    await fs.mkdir(nextPath);
  } else {
    await fs.writeFile(nextPath, content, 'utf8');
  }

  return nextPath;
}

export async function renameEntry(targetPath: string, nextName: string): Promise<string> {
  const resolved = resolveBrowserPath(targetPath);
  const safeName = path.basename(nextName.trim());
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new FileBrowserError('Valid name required', 400);
  }

  const nextPath = path.join(path.dirname(resolved), safeName);
  await fs.rename(resolved, nextPath);
  return nextPath;
}

export async function deleteEntry(targetPath: string): Promise<void> {
  const resolved = resolveBrowserPath(targetPath);
  const stats = await fs.stat(resolved).catch(() => {
    throw new FileBrowserError('Entry not found', 404);
  });

  if (stats.isDirectory()) {
    await fs.rm(resolved, { recursive: true, force: true });
    return;
  }

  await fs.unlink(resolved);
}

export async function writeUpload(
  targetDir: string,
  fileName: string,
  data: ReadableStream<Uint8Array>
): Promise<string> {
  const resolvedDir = resolveBrowserPath(targetDir);
  const safeName = path.basename(fileName);
  if (!safeName) {
    throw new FileBrowserError('Upload file name is required', 400);
  }

  const destination = path.join(resolvedDir, safeName);
  const output = await fs.open(destination, 'w');

  try {
    const nodeReadable = Readable.fromWeb(data as Parameters<typeof Readable.fromWeb>[0]);
    for await (const chunk of nodeReadable) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      await output.write(buffer);
    }
  } finally {
    await output.close();
  }

  return destination;
}

export async function createDownloadStream(targetPath: string): Promise<{
  stream: ReadableStream<Uint8Array>;
  fileName: string;
  mimeType: string;
}> {
  const resolved = resolveBrowserPath(targetPath);
  const stats = await fs.stat(resolved).catch(() => {
    throw new FileBrowserError('File not found', 404);
  });

  if (!stats.isFile()) {
    throw new FileBrowserError('Only files can be downloaded', 400);
  }

  return {
    stream: Readable.toWeb(createReadStream(resolved)) as ReadableStream<Uint8Array>,
    fileName: path.basename(resolved),
    mimeType: mimeTypeForExtension(resolved),
  };
}

export function matchesFilter(name: string, filter: string): boolean {
  if (!filter.trim()) return true;
  const escaped = filter
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const pattern = new RegExp(escaped, 'i');
  return pattern.test(name);
}

export function defaultShortcuts(): Shortcut[] {
  return [
    { id: 'root', label: 'Root', path: '/' },
    { id: 'home', label: 'Home', path: os.homedir() },
  ];
}

const STATUS_LABELS: Record<string, string> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'unmerged',
  '?': 'untracked',
  '!': 'ignored',
};

function parseStatusCode(code: string): string {
  return STATUS_LABELS[code] || code;
}

async function detectGitInfo(targetPath: string): Promise<GitInfo | null> {
  try {
    const { stdout: topLevelOut } = await execFileAsync('git', [
      '-C',
      targetPath,
      'rev-parse',
      '--show-toplevel',
    ]);
    const root = topLevelOut.trim();
    if (!root) return null;

    const [{ stdout: branchOut }, { stdout: statusOut }, { stdout: branchListOut }] =
      await Promise.all([
        execFileAsync('git', ['-C', root, 'branch', '--show-current']),
        execFileAsync('git', ['-C', root, 'status', '--porcelain=v1']),
        execFileAsync('git', ['-C', root, 'branch', '-a', '--no-color']),
      ]);

    const staged: GitFileStatus[] = [];
    const unstaged: GitFileStatus[] = [];
    const untracked: GitFileStatus[] = [];

    for (const line of statusOut.split('\n').filter(Boolean)) {
      const x = line[0];
      const y = line[1];
      const filePath = line.slice(3).trim();

      if (x === '?' && y === '?') {
        untracked.push({ path: filePath, status: 'untracked', staged: false });
      } else {
        if (x && x !== ' ' && x !== '?') {
          staged.push({ path: filePath, status: parseStatusCode(x), staged: true });
        }
        if (y && y !== ' ' && y !== '?') {
          unstaged.push({ path: filePath, status: parseStatusCode(y), staged: false });
        }
      }
    }

    const allBranches = branchListOut
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => b.replace(/^\* /, ''));

    const localBranches = allBranches.filter((b) => !b.startsWith('remotes/'));
    const remotes = allBranches
      .filter((b) => b.startsWith('remotes/'))
      .map((b) => b.replace(/^remotes\//, ''))
      .filter((b) => !b.includes('HEAD'));

    let ahead = 0;
    let behind = 0;
    try {
      const { stdout: abOut } = await execFileAsync('git', [
        '-C',
        root,
        'rev-list',
        '--left-right',
        '--count',
        'HEAD...@{upstream}',
      ]);
      const parts = abOut.trim().split(/\s+/);
      ahead = parseInt(parts[0], 10) || 0;
      behind = parseInt(parts[1], 10) || 0;
    } catch {
      /* no upstream */
    }

    const changedFiles = staged.length + unstaged.length + untracked.length;

    return {
      root,
      branch: branchOut.trim() || 'detached',
      dirty: changedFiles > 0,
      changedFiles,
      staged,
      unstaged,
      untracked,
      branches: localBranches,
      remotes,
      ahead,
      behind,
    };
  } catch {
    return null;
  }
}

export async function gitStage(root: string, filePath: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'add', '--', filePath]);
}

export async function gitUnstage(root: string, filePath: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'reset', 'HEAD', '--', filePath]);
}

export async function gitStageAll(root: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'add', '-A']);
}

export async function gitUnstageAll(root: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'reset', 'HEAD']);
}

export async function gitDiscardFile(root: string, filePath: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'checkout', '--', filePath]);
}

export async function gitDiscardAll(root: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'checkout', '--', '.']);
  await execFileAsync('git', ['-C', root, 'clean', '-fd']);
}

export async function gitCheckout(root: string, branch: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'checkout', branch]);
}

export async function gitFetch(root: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', ['-C', root, 'fetch', '--all', '--prune']);
  return (stdout + stderr).trim();
}

export async function gitCommit(root: string, message: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', root, 'commit', '-m', message]);
  return stdout.trim();
}

export async function gitPull(root: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', ['-C', root, 'pull']);
  return (stdout + stderr).trim();
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  authorEmail: string;
  date: string;
  subject: string;
  body: string;
}

export async function gitLog(root: string, limit = 50, since?: string): Promise<GitCommitInfo[]> {
  const commitMarker = '@@@COMMITSTART@@@';
  const separator = '@@@GITLOGSEG@@@';
  
  const args = [
    '-C',
    root,
    'log',
    `-${limit}`,
    `--pretty=format:${commitMarker}%H${separator}%an${separator}%ae${separator}%ai${separator}%s${separator}%b`,
  ];

  if (since && since !== 'all') {
    args.push(`--since=${since}`);
  }

  const { stdout } = await execFileAsync('git', args);

  if (!stdout.trim()) return [];

  return stdout
    .split(commitMarker)
    .filter(Boolean)
    .map((block) => {
      const [hash, author, email, date, subject, ...bodyParts] = block.split(separator);
      return {
        hash: hash?.trim() || '',
        author: author?.trim() || '',
        authorEmail: email?.trim() || '',
        date: date?.trim() || '',
        subject: subject?.trim() || '',
        body: bodyParts.join(separator).trim(),
      };
    });
}

export async function gitDiff(root: string, hash: string): Promise<string> {
  if (hash === 'staged') {
    const { stdout } = await execFileAsync('git', ['-C', root, 'diff', '--staged']);
    return stdout;
  }
  const { stdout } = await execFileAsync('git', ['-C', root, 'show', '--format=', hash]);
  return stdout;
}
