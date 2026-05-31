import { execFile as execFileCb } from 'node:child_process';
import { access, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai-runner:git-worktree');

const DEFAULT_WORKTREE_SUBDIR = '.worktrees/ai-runner';
const EXEC_TIMEOUT_MS = 30_000;

function execFileAsync(
  file: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileCb(
      file,
      args,
      { timeout: options?.timeout ?? EXEC_TIMEOUT_MS, cwd: options?.cwd },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          stdout,
          stderr,
        });
      }
    );
  });
}

/**
 * Check if a directory is inside a git repository work tree.
 * Returns `true` when git recognises the path as a working tree
 * (regular repos, bare repos with worktrees, or submodules).
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
  } catch {
    return false;
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      { cwd: dirPath, timeout: 5_000 }
    );
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Get the HEAD commit SHA for the repository at `repoPath`.
 */
export async function getHeadCommit(repoPath: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['rev-parse', 'HEAD'],
    { cwd: repoPath, timeout: 5_000 }
  );
  return stdout.trim();
}

/**
 * Resolve the base directory where AI Runner worktrees are stored.
 */
export function resolveWorktreeBaseDir(repoPath: string, customBaseDir?: string): string {
  if (customBaseDir) return customBaseDir;
  return path.join(repoPath, DEFAULT_WORKTREE_SUBDIR);
}

/**
 * Build the worktree path for a given run.
 */
export function resolveWorktreePath(baseDir: string, runId: string): string {
  return path.join(baseDir, `run-${runId}`);
}

/**
 * Create an ephemeral git worktree for an AI Runner run.
 *
 * The worktree checks out a detached HEAD at the current commit so each
 * parallel run starts from the same snapshot without interfering with the
 * main working tree's index or branch pointer.
 */
export async function createWorktree(options: {
  repoPath: string;
  runId: string;
  baseDir?: string;
}): Promise<{ worktreePath: string; commit: string }> {
  const baseDir = resolveWorktreeBaseDir(options.repoPath, options.baseDir);
  const worktreePath = resolveWorktreePath(baseDir, options.runId);

  await mkdir(baseDir, { recursive: true });

  const commit = await getHeadCommit(options.repoPath);

  await execFileAsync(
    'git',
    ['worktree', 'add', '--detach', worktreePath, commit],
    { cwd: options.repoPath }
  );

  log.info(`Created git worktree at ${worktreePath} (commit ${commit.slice(0, 8)})`);

  return { worktreePath, commit };
}

/**
 * Remove an ephemeral git worktree after an AI Runner run completes.
 *
 * Uses `git worktree remove --force` first. If that fails (e.g. modified
 * files in the worktree), falls back to deleting the directory and running
 * `git worktree prune` to clean up stale entries.
 */
export async function removeWorktree(options: {
  repoPath: string;
  worktreePath: string;
}): Promise<void> {
  try {
    await execFileAsync(
      'git',
      ['worktree', 'remove', '--force', options.worktreePath],
      { cwd: options.repoPath }
    );
    log.info(`Removed git worktree at ${options.worktreePath}`);
    return;
  } catch (error) {
    log.warn(
      `git worktree remove failed for ${options.worktreePath}, falling back to rm + prune`,
      error
    );
  }

  try {
    await rm(options.worktreePath, { recursive: true, force: true });
  } catch (rmError) {
    log.warn(`Failed to rm worktree directory ${options.worktreePath}`, rmError);
  }

  try {
    await execFileAsync(
      'git',
      ['worktree', 'prune'],
      { cwd: options.repoPath }
    );
    log.info(`Pruned stale worktrees for ${options.repoPath}`);
  } catch (pruneError) {
    log.warn(`git worktree prune failed for ${options.repoPath}`, pruneError);
  }
}
