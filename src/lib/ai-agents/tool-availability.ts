import { execFile } from 'node:child_process';
import type { AgentToolStatus, AgentType } from '@/modules/ai-agents/types';
import { AGENT_TOOL_DEFINITIONS } from './tool-catalog';

function execFileAsync(
  file: string,
  args: string[],
  options: { timeout: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

interface AgentToolProbe {
  type: AgentType;
  displayName: string;
  command: string;
  versionArgs: string[];
  latestVersionCommand?: string[];
}

const AGENT_TOOL_PROBES: AgentToolProbe[] = AGENT_TOOL_DEFINITIONS.filter(
  (tool): tool is typeof tool & { command: string } => Boolean(tool.command)
).map((tool) => ({
  type: tool.type,
  displayName: tool.name,
  command: tool.command,
  versionArgs: ['--version'],
  latestVersionCommand: tool.latestVersionCommand,
}));

const latestVersionCache = new Map<string, { version?: string; checkedAt: number }>();
const LATEST_VERSION_CACHE_MS = 10 * 60 * 1000;

async function findCommand(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('sh', ['-lc', `command -v ${command}`], {
      timeout: 2_000,
    });
    const path = stdout.trim().split('\n')[0];
    return path || undefined;
  } catch {
    return undefined;
  }
}

async function readVersion(command: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 3_000 });
    const version = `${stdout}${stderr}`.trim().split('\n')[0];
    return version || undefined;
  } catch {
    return undefined;
  }
}

async function readLatestVersion(probe: AgentToolProbe): Promise<string | undefined> {
  if (!probe.latestVersionCommand) return undefined;
  const cached = latestVersionCache.get(probe.type);
  if (cached && Date.now() - cached.checkedAt < LATEST_VERSION_CACHE_MS) return cached.version;

  const [command, ...args] = probe.latestVersionCommand;
  if (!command) return undefined;

  const version = await readVersion(command, args);
  latestVersionCache.set(probe.type, { version, checkedAt: Date.now() });
  return version;
}

function normalizeVersion(version?: string): string | undefined {
  return version?.match(/\d+\.\d+\.\d+(?:[-+][\w.-]+)?/)?.[0] ?? version?.trim();
}

export async function getAgentToolStatuses(): Promise<AgentToolStatus[]> {
  const checkedAt = new Date().toISOString();
  const statuses = await Promise.all(
    AGENT_TOOL_PROBES.map(async (probe): Promise<AgentToolStatus> => {
      const path = await findCommand(probe.command);
      if (!path) {
        return {
          type: probe.type,
          displayName: probe.displayName,
          command: probe.command,
          installed: false,
          checkedAt,
          error: `${probe.command}: command not found`,
        };
      }

      const [version, latestVersion] = await Promise.all([
        readVersion(probe.command, probe.versionArgs),
        readLatestVersion(probe),
      ]);
      const current = normalizeVersion(version);
      const latest = normalizeVersion(latestVersion);
      return {
        type: probe.type,
        displayName: probe.displayName,
        command: probe.command,
        installed: true,
        path,
        version,
        latestVersion: latest,
        updateAvailable: Boolean(current && latest && current !== latest),
        checkedAt,
      };
    })
  );

  return statuses;
}
