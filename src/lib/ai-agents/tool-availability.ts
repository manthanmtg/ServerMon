import { execFile } from 'node:child_process';
import type { AgentToolStatus, AgentType } from '@/modules/ai-agents/types';

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
}

const AGENT_TOOL_PROBES: AgentToolProbe[] = [
  { type: 'codex', displayName: 'Codex', command: 'codex', versionArgs: ['--version'] },
  {
    type: 'claude-code',
    displayName: 'Claude Code',
    command: 'claude',
    versionArgs: ['--version'],
  },
  { type: 'opencode', displayName: 'OpenCode', command: 'opencode', versionArgs: ['--version'] },
  { type: 'gemini-cli', displayName: 'Gemini CLI', command: 'gemini', versionArgs: ['--version'] },
  { type: 'aider', displayName: 'Aider', command: 'aider', versionArgs: ['--version'] },
];

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

      const version = await readVersion(probe.command, probe.versionArgs);
      return {
        type: probe.type,
        displayName: probe.displayName,
        command: probe.command,
        installed: true,
        path,
        version,
        checkedAt,
      };
    })
  );

  return statuses;
}
