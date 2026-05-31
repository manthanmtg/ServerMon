import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFile as execFileCb } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isGitRepository,
  getHeadCommit,
  createWorktree,
  removeWorktree,
  resolveWorktreeBaseDir,
  resolveWorktreePath,
} from './git-worktree';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function exec(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileCb(command, args, { cwd: options?.cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        stdout: typeof stdout === 'string' ? stdout : stdout.toString(),
        stderr: typeof stderr === 'string' ? stderr : stderr.toString(),
      });
    });
  });
}

describe('git-worktree', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'servermon-git-wt-test-'));
    await exec('git', ['init', tempDir]);
    await exec('git', ['-C', tempDir, 'config', 'user.email', 'test@servermon.dev']);
    await exec('git', ['-C', tempDir, 'config', 'user.name', 'Test']);
    await exec('git', ['-C', tempDir, 'commit', '--allow-empty', '-m', 'initial']);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('isGitRepository', () => {
    it('returns true for a git-initialised directory', async () => {
      expect(await isGitRepository(tempDir)).toBe(true);
    });

    it('returns false for a plain directory', async () => {
      const plainDir = await mkdtemp(path.join(os.tmpdir(), 'servermon-git-wt-plain-'));
      try {
        expect(await isGitRepository(plainDir)).toBe(false);
      } finally {
        await rm(plainDir, { recursive: true, force: true });
      }
    });

    it('returns false for a non-existent path', async () => {
      expect(await isGitRepository('/tmp/does-not-exist-' + Date.now())).toBe(false);
    });
  });

  describe('getHeadCommit', () => {
    it('returns a 40-char hex SHA', async () => {
      const sha = await getHeadCommit(tempDir);
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  describe('resolveWorktreeBaseDir', () => {
    it('uses repo .worktrees/ai-runner by default', () => {
      expect(resolveWorktreeBaseDir('/root/repos/my-project')).toBe(
        '/root/repos/my-project/.worktrees/ai-runner'
      );
    });

    it('uses custom base dir when provided', () => {
      expect(resolveWorktreeBaseDir('/root/repos/my-project', '/tmp/worktrees')).toBe(
        '/tmp/worktrees'
      );
    });
  });

  describe('resolveWorktreePath', () => {
    it('creates run-prefixed path', () => {
      expect(resolveWorktreePath('/base', 'abc123')).toBe('/base/run-abc123');
    });
  });

  describe('createWorktree + removeWorktree', () => {
    it('creates and removes a worktree', async () => {
      const result = await createWorktree({
        repoPath: tempDir,
        runId: 'test-run-1',
      });

      expect(result.worktreePath).toContain('run-test-run-1');
      expect(result.commit).toMatch(/^[0-9a-f]{40}$/);

      // Worktree directory should exist
      await expect(access(result.worktreePath)).resolves.toBeUndefined();

      // Verify git sees the worktree
      const { stdout } = await exec('git', ['worktree', 'list'], { cwd: tempDir });
      expect(stdout).toContain('run-test-run-1');

      // Remove worktree
      await removeWorktree({
        repoPath: tempDir,
        worktreePath: result.worktreePath,
      });

      // Worktree directory should be gone
      await expect(access(result.worktreePath)).rejects.toThrow();
    });

    it('uses custom base dir', async () => {
      const customBase = path.join(tempDir, 'custom-worktrees');
      const result = await createWorktree({
        repoPath: tempDir,
        runId: 'test-run-custom',
        baseDir: customBase,
      });

      expect(result.worktreePath).toBe(path.join(customBase, 'run-test-run-custom'));
      await expect(access(result.worktreePath)).resolves.toBeUndefined();

      await removeWorktree({
        repoPath: tempDir,
        worktreePath: result.worktreePath,
      });
    });

    it('removeWorktree handles already-deleted directories gracefully', async () => {
      const result = await createWorktree({
        repoPath: tempDir,
        runId: 'test-run-already-gone',
      });

      // Delete the directory manually before calling removeWorktree
      await rm(result.worktreePath, { recursive: true, force: true });

      // Should not throw
      await expect(
        removeWorktree({
          repoPath: tempDir,
          worktreePath: result.worktreePath,
        })
      ).resolves.toBeUndefined();
    });
  });
});
