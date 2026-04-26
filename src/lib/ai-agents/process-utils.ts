import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { SessionResourceUsage } from '@/modules/ai-agents/types';

export function execPromise(cmd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

/**
 * Read the tail (last N bytes) of a file as UTF-8. For line-oriented formats
 * like .jsonl we strip the leading partial line. Falls back to reading the
 * whole file if it's smaller than maxBytes. This avoids blocking the event
 * loop reading multi-MB conversation logs on every snapshot.
 */
export function readFileTailSync(filePath: string, maxBytes = 256 * 1024): string {
  let fd: number | undefined;
  try {
    let size: number | undefined;
    try {
      size = fs.statSync(filePath)?.size;
    } catch {
      size = undefined;
    }
    // If we can't determine a real size, fall back to readFileSync (keeps
    // tests and edge cases working — they rely on fs.readFileSync being
    // mocked/available).
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= maxBytes) {
      return fs.readFileSync(filePath, 'utf8');
    }
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const position = size - maxBytes;
    fs.readSync(fd, buffer, 0, maxBytes, position);
    const text = buffer.toString('utf8');
    // Drop the first (likely partial) line since we started mid-file.
    const firstNewline = text.indexOf('\n');
    return firstNewline >= 0 ? text.slice(firstNewline + 1) : text;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Read the first complete line plus the bounded tail of a line-oriented file.
 * AI session logs often store metadata in the first JSONL record and recent
 * activity at the end; preserving both keeps snapshots useful without loading
 * the whole history.
 */
export function readFileHeadAndTailSync(filePath: string, maxTailBytes = 256 * 1024): string {
  let fd: number | undefined;
  try {
    let size: number | undefined;
    try {
      size = fs.statSync(filePath)?.size;
    } catch {
      size = undefined;
    }
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= maxTailBytes) {
      return fs.readFileSync(filePath, 'utf8');
    }

    fd = fs.openSync(filePath, 'r');
    const headBuffer = Buffer.alloc(Math.min(maxTailBytes, size));
    fs.readSync(fd, headBuffer, 0, headBuffer.length, 0);
    const headText = headBuffer.toString('utf8');
    const firstNewline = headText.indexOf('\n');
    const firstLine = firstNewline >= 0 ? headText.slice(0, firstNewline) : headText;

    const tailBuffer = Buffer.alloc(maxTailBytes);
    const tailPosition = size - maxTailBytes;
    fs.readSync(fd, tailBuffer, 0, maxTailBytes, tailPosition);
    const tailText = tailBuffer.toString('utf8');
    const tailNewline = tailText.indexOf('\n');
    const tail = tailNewline >= 0 ? tailText.slice(tailNewline + 1) : tailText;

    return tail.startsWith(firstLine) ? tail : `${firstLine}\n${tail}`;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

// Cached hostname — os.hostname() is cheap but we also avoid repeated
// syscalls across many sessions per snapshot.
let _cachedHostname: string | null = null;
export function getHostnameCached(): string {
  if (_cachedHostname === null) {
    try {
      _cachedHostname = os.hostname() || 'localhost';
    } catch {
      _cachedHostname = 'localhost';
    }
  }
  return _cachedHostname;
}

export async function getProcessResourceUsage(pid: number): Promise<SessionResourceUsage> {
  try {
    // macOS ps doesn't support --no-headers, so we fetch with headers and skip the first line
    const { stdout } = await execPromise(`ps -p ${pid} -o %cpu,%mem,rss`);
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return { cpuPercent: 0, memoryPercent: 0, memoryBytes: 0 };

    const dataLine = lines[1];
    const parts = dataLine.trim().split(/\s+/);
    if (parts.length >= 3) {
      return {
        cpuPercent: parseFloat(parts[0]) || 0,
        memoryPercent: parseFloat(parts[1]) || 0,
        memoryBytes: (parseInt(parts[2], 10) || 0) * 1024,
      };
    }
  } catch {
    /* process may have exited */
  }
  return { cpuPercent: 0, memoryPercent: 0, memoryBytes: 0 };
}

type GitInfo = { repository?: string; branch?: string };
const GIT_INFO_CACHE_TTL_MS = 30_000;
const _gitInfoCache = new Map<string, { value: GitInfo; expiresAt: number }>();

export async function detectGitInfo(cwd: string): Promise<GitInfo> {
  if (!cwd || cwd === '~') return {};
  const now = Date.now();
  const cached = _gitInfoCache.get(cwd);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  let value: GitInfo = {};
  try {
    const [repoResult, branchResult] = await Promise.all([
      execPromise(`git -C "${cwd}" rev-parse --show-toplevel 2>/dev/null`),
      execPromise(`git -C "${cwd}" rev-parse --abbrev-ref HEAD 2>/dev/null`),
    ]);
    const repoPath = repoResult.stdout.trim();
    const repository = repoPath ? repoPath.split('/').pop() : undefined;
    const branch = branchResult.stdout.trim() || undefined;
    value = { repository, branch };
  } catch {
    value = {};
  }
  _gitInfoCache.set(cwd, { value, expiresAt: now + GIT_INFO_CACHE_TTL_MS });
  // Bound cache size to avoid unbounded growth if many unique cwds appear
  if (_gitInfoCache.size > 256) {
    const oldestKey = _gitInfoCache.keys().next().value;
    if (oldestKey !== undefined) _gitInfoCache.delete(oldestKey);
  }
  return value;
}

export async function killProcess(
  pid: number,
  signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'
): Promise<boolean> {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** Discover all user home directories on the system. */
export function discoverHomeDirs(): Array<{ username: string; homeDir: string }> {
  const results: Array<{ username: string; homeDir: string }> = [];
  const seen = new Set<string>();

  const addDir = (homeDir: string, username: string) => {
    if (seen.has(homeDir)) return;
    try {
      if (fs.existsSync(homeDir)) {
        seen.add(homeDir);
        results.push({ username, homeDir });
      }
    } catch {
      /* permission denied, skip */
    }
  };

  // Always include the current user
  addDir(os.homedir(), os.userInfo().username);

  // macOS: /Users/*
  try {
    if (fs.existsSync('/Users')) {
      for (const name of fs.readdirSync('/Users')) {
        if (name.startsWith('.')) continue;
        addDir(path.join('/Users', name), name);
      }
    }
  } catch {
    /* skip */
  }

  // Linux: /home/* + /root
  try {
    if (fs.existsSync('/home')) {
      for (const name of fs.readdirSync('/home')) {
        if (name.startsWith('.')) continue;
        addDir(path.join('/home', name), name);
      }
    }
  } catch {
    /* skip */
  }
  addDir('/root', 'root');

  return results;
}
