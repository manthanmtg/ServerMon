import { access } from 'node:fs/promises';
import type { CommandRunner } from './deploy';

export interface GitCommandOptions {
  commandRunner: CommandRunner;
  repositoryPath?: string;
}

export interface EnsureGitCheckoutOptions extends GitCommandOptions {
  repoUrl: string;
  branch: string;
  repositoryPath: string;
  pathExists?: (target: string) => Promise<boolean>;
}

export interface PrepareGitSourceOptions extends EnsureGitCheckoutOptions {
  updateToRemote?: boolean;
}

export interface PrepareGitSourceResult {
  sourcePath: string;
  previousSha?: string;
  remoteSha?: string;
  currentSha?: string;
  changed: boolean;
  cloned: boolean;
  logs: string[];
}

const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;

export function isHttpsGitUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateGitBranch(branch: string): string {
  const normalized = branch.trim();
  if (!normalized || !SAFE_BRANCH_PATTERN.test(normalized) || normalized.includes('..')) {
    throw new Error('Invalid git branch');
  }
  return normalized;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function defaultPathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function runGitCommand(
  { commandRunner, repositoryPath }: GitCommandOptions,
  command: string,
  logs?: string[]
): Promise<string> {
  logs?.push(`$ ${command}`);
  const result = await commandRunner({ command, cwd: repositoryPath });
  if (result.output.trim()) logs?.push(result.output.trim());
  if (result.code !== 0) {
    throw new Error(`Git command failed: ${command}\n${result.output}`.trim());
  }
  return result.output.trim();
}

export async function ensureGitCheckout({
  repoUrl,
  branch,
  repositoryPath,
  commandRunner,
  pathExists = defaultPathExists,
}: EnsureGitCheckoutOptions): Promise<{ currentSha: string; cloned: boolean; logs: string[] }> {
  if (!isHttpsGitUrl(repoUrl)) throw new Error('Git URL must be an HTTPS URL');
  const normalizedBranch = validateGitBranch(branch);
  const logs: string[] = [];

  if (!(await pathExists(repositoryPath))) {
    await runGitCommand(
      { commandRunner },
      [
        'git clone',
        `--branch ${normalizedBranch}`,
        '--single-branch',
        shellQuote(repoUrl),
        shellQuote(repositoryPath),
      ].join(' '),
      logs
    );
    const currentSha = await runGitCommand(
      { commandRunner, repositoryPath },
      'git rev-parse HEAD',
      logs
    );
    return { currentSha, cloned: true, logs };
  }

  const existingOrigin = await runGitCommand(
    { commandRunner, repositoryPath },
    'git config --get remote.origin.url',
    logs
  );
  if (existingOrigin !== repoUrl) {
    throw new Error('Managed checkout origin does not match the configured git URL');
  }

  await runGitCommand(
    { commandRunner, repositoryPath },
    `git fetch origin ${normalizedBranch}`,
    logs
  );
  const currentSha = await runGitCommand(
    { commandRunner, repositoryPath },
    'git rev-parse HEAD',
    logs
  );
  return { currentSha, cloned: false, logs };
}

export async function getRemoteHeadSha({
  branch,
  repositoryPath,
  commandRunner,
}: {
  branch: string;
  repositoryPath: string;
  commandRunner: CommandRunner;
}): Promise<string> {
  const normalizedBranch = validateGitBranch(branch);
  const output = await runGitCommand(
    { commandRunner, repositoryPath },
    `git ls-remote origin refs/heads/${normalizedBranch}`
  );
  const sha = output.split(/\s+/)[0];
  if (!sha) throw new Error(`Remote branch not found: ${normalizedBranch}`);
  return sha;
}

export async function prepareGitSourceForDeploy({
  repoUrl,
  branch,
  repositoryPath,
  commandRunner,
  pathExists,
  updateToRemote = false,
}: PrepareGitSourceOptions): Promise<PrepareGitSourceResult> {
  const checkout = await ensureGitCheckout({
    repoUrl,
    branch,
    repositoryPath,
    commandRunner,
    pathExists,
  });
  const logs = [...checkout.logs];
  const previousSha = checkout.currentSha;
  const remoteSha = await getRemoteHeadSha({ branch, repositoryPath, commandRunner });
  let currentSha = previousSha;
  let changed = checkout.cloned || remoteSha !== previousSha;

  if (updateToRemote && remoteSha !== previousSha) {
    await runGitCommand(
      { commandRunner, repositoryPath },
      `git reset --hard origin/${validateGitBranch(branch)}`,
      logs
    );
    currentSha = await runGitCommand({ commandRunner, repositoryPath }, 'git rev-parse HEAD', logs);
    changed = currentSha !== previousSha;
  }

  return {
    sourcePath: repositoryPath,
    previousSha,
    remoteSha,
    currentSha,
    changed,
    cloned: checkout.cloned,
    logs,
  };
}
