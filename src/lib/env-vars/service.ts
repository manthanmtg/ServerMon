import { access, mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import type {
  EnvVarAction,
  EnvVarInstruction,
  EnvVarMutationInput,
  EnvVarMutationResult,
  EnvVarPlatform,
  EnvVarRecord,
  EnvVarsSnapshot,
  EnvVarTarget,
  ParsedEnvFile,
} from '@/modules/env-vars/types';

const execFileAsync = promisify(execFile);
const SIMPLE_ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*?)\s*$/;
const SECRET_KEY_PATTERN = /(SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL|API_KEY|KEY)$/i;

type EnvDictionary = Record<string, string | undefined>;
type EnvCommandRunner = (target: EnvVarTarget, env: EnvDictionary) => Promise<string>;

interface SnapshotOptions {
  env?: EnvDictionary;
  platform?: EnvVarPlatform;
  execEnvCommand?: EnvCommandRunner;
}

export function isValidEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

export function isSecretEnvKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function quoteShellValue(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function stripInlineComment(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return trimmed;
  const hashIndex = trimmed.indexOf(' #');
  return hashIndex >= 0 ? trimmed.slice(0, hashIndex).trim() : trimmed;
}

function unquoteShellValue(raw: string): string | null {
  const value = stripInlineComment(raw);
  if (!value) return '';
  if (value.startsWith('$(') || value.includes('`')) return null;
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length === 1) return null;
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length === 1) return null;
    return value.slice(1, -1).replace(/'"'"'/g, "'");
  }
  if (/[;$|&<>]/.test(value)) return null;
  return value;
}

function lineKey(line: string): string | null {
  const match = SIMPLE_ENV_LINE.exec(line);
  return match?.[1] ?? null;
}

function toEnvRecord(
  key: string,
  value: string,
  source: string,
  inCurrentSession: boolean
): EnvVarRecord {
  return {
    key,
    value,
    scope: 'user',
    source,
    writable: true,
    sensitive: isSecretEnvKey(key),
    inCurrentSession,
  };
}

async function readTextFileIfExists(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

export async function parseShellEnvFile(
  file: string,
  currentEnv: EnvDictionary = process.env
): Promise<ParsedEnvFile> {
  const content = await readTextFileIfExists(file);
  const variables: EnvVarRecord[] = [];
  const skipped = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = SIMPLE_ENV_LINE.exec(line);
    if (!match) continue;

    const key = match[1];
    const value = unquoteShellValue(match[2]);
    if (value === null) {
      skipped.push({
        key,
        source: file,
        reason: 'Complex shell expression cannot be edited safely.',
      });
      continue;
    }

    variables.push(toEnvRecord(key, value, file, currentEnv[key] === value));
  }

  return { variables, skipped };
}

function assertValidKey(key: string) {
  if (!isValidEnvKey(key)) {
    throw new Error(
      'Environment variable names must start with a letter or underscore and use only letters, numbers, and underscores.'
    );
  }
}

function isSimpleEditableLineForKey(line: string, key: string): boolean {
  const match = SIMPLE_ENV_LINE.exec(line);
  if (match?.[1] !== key) return false;
  return unquoteShellValue(match[2]) !== null;
}

function hasComplexLineForKey(line: string, key: string): boolean {
  const match = SIMPLE_ENV_LINE.exec(line);
  return match?.[1] === key && unquoteShellValue(match[2]) === null;
}

export async function upsertShellEnvFile(file: string, key: string, value: string): Promise<void> {
  assertValidKey(key);
  await mkdir(path.dirname(file), { recursive: true });
  const content = await readTextFileIfExists(file);
  const lines = content ? content.split(/\r?\n/) : [];
  if (lines.at(-1) === '') lines.pop();

  let replaced = false;
  const nextLines = lines.map((line) => {
    if (hasComplexLineForKey(line, key)) {
      throw new Error(
        `Cannot safely replace complex assignment for ${key}. Remove it manually first.`
      );
    }
    if (isSimpleEditableLineForKey(line, key)) {
      replaced = true;
      return `export ${key}=${quoteShellValue(value)}`;
    }
    return line;
  });

  if (!replaced) {
    nextLines.push(`export ${key}=${quoteShellValue(value)}`);
  }

  await writeFile(file, `${nextLines.join('\n')}\n`, 'utf8');
}

export async function deleteFromShellEnvFile(file: string, key: string): Promise<void> {
  assertValidKey(key);
  const content = await readTextFileIfExists(file);
  const lines = content ? content.split(/\r?\n/) : [];
  if (lines.at(-1) === '') lines.pop();

  const nextLines = lines.filter((line) => {
    if (hasComplexLineForKey(line, key)) {
      throw new Error(
        `Cannot safely delete complex assignment for ${key}. Remove it manually first.`
      );
    }
    return lineKey(line) !== key;
  });

  await writeFile(file, nextLines.length > 0 ? `${nextLines.join('\n')}\n` : '', 'utf8');
}

function shellName(shell: string | undefined): string {
  return path.basename(shell || '').toLowerCase();
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function detectUserTarget(
  env: EnvDictionary = process.env,
  platform: EnvVarPlatform = process.platform
): Promise<EnvVarTarget> {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const shell = env.SHELL ?? null;

  if (platform === 'win32') {
    return {
      platform,
      shell: null,
      home,
      userFile: null,
      writable: true,
      note: 'Windows user environment variables are written to the current user scope.',
    };
  }

  const name = shellName(shell ?? undefined);
  let userFile: string;
  if (name === 'zsh') {
    userFile = path.join(home, '.zshenv');
  } else if (name === 'bash') {
    const bashProfile = path.join(home, '.bash_profile');
    userFile = (await exists(bashProfile)) ? bashProfile : path.join(home, '.profile');
  } else {
    userFile = path.join(home, '.profile');
  }

  return {
    platform,
    shell,
    home,
    userFile,
    writable: true,
    note: `User-scope changes are written to ${userFile}. Open a fresh login shell or terminal to see them in env.`,
  };
}

function powershellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildSystemInstruction(input: {
  platform: EnvVarPlatform | string;
  action: EnvVarAction;
  key: string;
  value?: string;
}): EnvVarInstruction {
  assertValidKey(input.key);
  const value = input.value ?? '';

  if (input.platform === 'win32') {
    const command =
      input.action === 'add'
        ? `[Environment]::SetEnvironmentVariable(${powershellString(input.key)}, ${powershellString(value)}, "Machine")`
        : `[Environment]::SetEnvironmentVariable(${powershellString(input.key)}, $null, "Machine")`;
    return {
      title:
        input.action === 'add'
          ? 'Add machine environment variable'
          : 'Delete machine environment variable',
      command,
      description:
        'Run this in an elevated PowerShell window. Open a new terminal after applying it.',
      requiresAdmin: true,
    };
  }

  if (input.platform === 'darwin') {
    const command =
      input.action === 'add'
        ? `sudo launchctl setenv ${input.key} ${quoteShellValue(value)}`
        : `sudo launchctl unsetenv ${input.key}`;
    return {
      title:
        input.action === 'add'
          ? 'Add macOS global launchd variable'
          : 'Delete macOS global launchd variable',
      command,
      description:
        'Run this in Terminal with administrator privileges. Restart affected apps or log in again.',
      requiresAdmin: true,
    };
  }

  const command =
    input.action === 'add'
      ? `sudo sh -c "grep -v '^${input.key}=' /etc/environment > /tmp/servermon-env && printf '%s=%s\\n' '${input.key}' ${quoteShellValue(value)} >> /tmp/servermon-env && cat /tmp/servermon-env > /etc/environment && rm /tmp/servermon-env"`
      : `sudo sh -c "grep -v '^${input.key}=' /etc/environment > /tmp/servermon-env && cat /tmp/servermon-env > /etc/environment && rm /tmp/servermon-env"`;
  return {
    title:
      input.action === 'add'
        ? 'Add system environment variable'
        : 'Delete system environment variable',
    command,
    description:
      'Run this with sudo. New login sessions and restarted services can read the updated system environment.',
    requiresAdmin: true,
  };
}

function envRecordsToDictionary(records: EnvVarRecord[]): EnvDictionary {
  return Object.fromEntries(records.map((record) => [record.key, record.value]));
}

export function parseEnvCommandOutput(output: string): EnvVarRecord[] {
  return output
    .split(/\r?\n/)
    .flatMap((line): EnvVarRecord[] => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) return [];

      const key = line.slice(0, separatorIndex);
      if (!isValidEnvKey(key)) return [];

      return [
        {
          key,
          value: line.slice(separatorIndex + 1),
          scope: 'session',
          source: 'env command',
          writable: false,
          sensitive: isSecretEnvKey(key),
          inCurrentSession: true,
        },
      ];
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

function toProcessEnv(env: EnvDictionary): NodeJS.ProcessEnv {
  return env as unknown as NodeJS.ProcessEnv;
}

function sanitizedShellSeedEnv(target: EnvVarTarget, env: EnvDictionary): EnvDictionary {
  const user =
    env.USER || env.LOGNAME || (target.home === '/root' ? 'root' : path.basename(target.home));
  return {
    HOME: target.home,
    LANG: env.LANG || 'en_US.UTF-8',
    LOGNAME: env.LOGNAME || user,
    PATH: env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    SHELL: target.shell || env.SHELL || '/bin/sh',
    TERM: env.TERM || 'xterm-256color',
    USER: user,
  };
}

async function runShellEnvCommand(target: EnvVarTarget, env: EnvDictionary): Promise<string> {
  if (target.platform === 'win32') {
    const command =
      'Get-ChildItem Env: | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }';
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  }

  const shell = target.shell || env.SHELL || '/bin/sh';
  const shellBase = shellName(shell);
  const shellArgs = ['bash', 'zsh', 'ksh', 'fish'].includes(shellBase)
    ? ['-lc', 'env']
    : ['-c', 'env'];
  const { stdout } = await execFileAsync(shell, shellArgs, {
    cwd: target.home,
    env: toProcessEnv(sanitizedShellSeedEnv(target, env)),
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

async function readEnvCommandRecords(
  target: EnvVarTarget,
  env: EnvDictionary,
  execEnvCommand: EnvCommandRunner = runShellEnvCommand
): Promise<EnvVarRecord[]> {
  try {
    return parseEnvCommandOutput(await execEnvCommand(target, env));
  } catch {
    const { stdout } = await execFileAsync('env', [], {
      cwd: target.home,
      env: toProcessEnv(sanitizedShellSeedEnv(target, env)),
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    return parseEnvCommandOutput(stdout);
  }
}

function currentSessionEnv(env: EnvDictionary = process.env): EnvVarRecord[] {
  return Object.entries(env)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      value,
      scope: 'session',
      source: 'Current ServerMon process',
      writable: false,
      sensitive: isSecretEnvKey(key),
      inCurrentSession: true,
    }));
}

async function readWindowsUserEnv(currentEnv: EnvDictionary): Promise<EnvVarRecord[]> {
  const command =
    '[Environment]::GetEnvironmentVariables("User").GetEnumerator() | Sort-Object Name | ConvertTo-Json -Compress';
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command]);
    if (!stdout.trim()) return [];
    const parsed = JSON.parse(stdout) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    return entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('Name' in entry) || !('Value' in entry))
        return [];
      const key = String(entry.Name);
      const value = String(entry.Value ?? '');
      return [
        {
          key,
          value,
          scope: 'user' as const,
          source: 'Windows User Environment',
          writable: true,
          sensitive: isSecretEnvKey(key),
          inCurrentSession: currentEnv[key] === value,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function getSnapshot(options: SnapshotOptions = {}): Promise<EnvVarsSnapshot> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const target = await detectUserTarget(env, platform);
  let session = await readEnvCommandRecords(target, env, options.execEnvCommand);
  if (session.length === 0) {
    session = currentSessionEnv(env);
  }
  const sessionEnv = envRecordsToDictionary(session);
  const parsed =
    platform === 'win32'
      ? { variables: await readWindowsUserEnv(sessionEnv), skipped: [] }
      : target.userFile
        ? await parseShellEnvFile(target.userFile, sessionEnv)
        : { variables: [], skipped: [] };

  return {
    platform,
    shell: target.shell,
    target,
    persistent: parsed.variables.sort((a, b) => a.key.localeCompare(b.key)),
    session,
    skipped: parsed.skipped,
    systemInstructions: {
      addTemplate: buildSystemInstruction({
        platform,
        action: 'add',
        key: 'EXAMPLE_KEY',
        value: 'example-value',
      }),
      deleteTemplate: buildSystemInstruction({
        platform,
        action: 'delete',
        key: 'EXAMPLE_KEY',
      }),
    },
    guidance: [
      'Open a new terminal or login shell after user-scope changes.',
      'Restart services or apps that need to read updated environment variables.',
      'System-scope changes require administrator privileges and are shown as instructions.',
    ],
    generatedAt: new Date().toISOString(),
  };
}

async function setWindowsUserEnv(key: string, value: string | null): Promise<void> {
  const command =
    value === null
      ? `[Environment]::SetEnvironmentVariable(${powershellString(key)}, $null, "User")`
      : `[Environment]::SetEnvironmentVariable(${powershellString(key)}, ${powershellString(value)}, "User")`;
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command]);
}

export async function addEnvVar(input: EnvVarMutationInput): Promise<EnvVarMutationResult> {
  assertValidKey(input.key);
  if (input.scope === 'system') {
    return {
      applied: false,
      message:
        'System-scope changes require administrator privileges. Run the generated command manually.',
      instruction: buildSystemInstruction({
        platform: process.platform,
        action: 'add',
        key: input.key,
        value: input.value ?? '',
      }),
    };
  }

  const target = await detectUserTarget();
  if (process.platform === 'win32') {
    await setWindowsUserEnv(input.key, input.value ?? '');
  } else if (target.userFile) {
    await upsertShellEnvFile(target.userFile, input.key, input.value ?? '');
  } else {
    throw new Error('No writable user environment target was detected.');
  }

  return {
    applied: true,
    message:
      'User environment variable saved. Open a new terminal or login shell to see it in env.',
    target,
  };
}

export async function deleteEnvVar(input: EnvVarMutationInput): Promise<EnvVarMutationResult> {
  assertValidKey(input.key);
  if (input.scope === 'system') {
    return {
      applied: false,
      message:
        'System-scope changes require administrator privileges. Run the generated command manually.',
      instruction: buildSystemInstruction({
        platform: process.platform,
        action: 'delete',
        key: input.key,
      }),
    };
  }

  const target = await detectUserTarget();
  if (process.platform === 'win32') {
    await setWindowsUserEnv(input.key, null);
  } else if (target.userFile) {
    await deleteFromShellEnvFile(target.userFile, input.key);
  } else {
    throw new Error('No writable user environment target was detected.');
  }

  return {
    applied: true,
    message:
      'User environment variable deleted. Open a new terminal or login shell to confirm with env.',
    target,
  };
}

export const envVarsService = {
  getSnapshot,
  addEnvVar,
  deleteEnvVar,
};
