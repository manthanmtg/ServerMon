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

export async function detectGitInfo(
  cwd: string
): Promise<{ repository?: string; branch?: string }> {
  if (!cwd || cwd === '~') return {};
  try {
    const [repoResult, branchResult] = await Promise.all([
      execPromise(`git -C "${cwd}" rev-parse --show-toplevel 2>/dev/null`),
      execPromise(`git -C "${cwd}" rev-parse --abbrev-ref HEAD 2>/dev/null`),
    ]);
    const repoPath = repoResult.stdout.trim();
    const repository = repoPath ? repoPath.split('/').pop() : undefined;
    const branch = branchResult.stdout.trim() || undefined;
    return { repository, branch };
  } catch {
    return {};
  }
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
