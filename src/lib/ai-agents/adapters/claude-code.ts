import * as fs from 'fs';
import * as path from 'path';
import {
  execPromise,
  detectGitInfo,
  discoverHomeDirs,
  getHostnameCached,
  readFileTailSync,
} from '../process-utils';
import { createLogger } from '@/lib/logger';
import type {
  AgentAdapter,
  AgentSession,
  AgentType,
  ConversationEntry,
  ActionTimelineEntry,
} from '@/modules/ai-agents/types';

const log = createLogger('ai-agents:claude-code');

// If the latest .jsonl was modified within this window, consider the session active
const ACTIVE_THRESHOLD_MS = 120_000;

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly agentType: AgentType = 'claude-code';
  readonly displayName = 'Claude Code';

  async detect(): Promise<AgentSession[]> {
    const sessions: AgentSession[] = [];

    for (const { username, homeDir } of discoverHomeDirs()) {
      const projectsDir = path.join(homeDir, '.claude/projects');
      try {
        if (!fs.existsSync(projectsDir)) continue;

        const projectFolders = fs
          .readdirSync(projectsDir)
          .filter((f) => fs.statSync(path.join(projectsDir, f)).isDirectory())
          .map((f) => ({ name: f, time: fs.statSync(path.join(projectsDir, f)).mtime.getTime() }))
          .sort((a, b) => b.time - a.time)
          .slice(0, 20);

        for (const folder of projectFolders) {
          try {
            const session = await this.buildSession(folder.name, projectsDir, username);
            if (session) sessions.push(session);
          } catch (err) {
            log.debug(`Failed to build session for ${username}:${folder.name}`, err);
          }
        }
      } catch (err) {
        log.debug(`Claude Code detection failed for user ${username}`, err);
      }
    }
    return sessions;
  }

  private async buildSession(
    projectFolderName: string,
    projectsDir: string,
    username: string
  ): Promise<AgentSession | null> {
    const historyData = await this.extractSessionData(projectFolderName, projectsDir);
    if (historyData.conversation.length === 0) return null;

    const cwd = this.recoverPath(projectFolderName);
    const gitInfo = cwd ? await detectGitInfo(cwd) : {};
    const now = new Date().toISOString();
    const isActive = historyData.fileModifiedAt
      ? Date.now() - historyData.fileModifiedAt < ACTIVE_THRESHOLD_MS
      : false;

    // Attempt to find PID if active
    let pid = 0;
    if (isActive && cwd) {
      try {
        const { stdout } = await execPromise(
          `ps aux | grep "claude" | grep "${cwd}" | grep -v grep | awk '{print $2}' | head -n 1`
        );
        if (stdout.trim()) {
          pid = parseInt(stdout.trim(), 10);
        }
      } catch {
        /* ignore */
      }
    }

    return {
      id: `claude-code-${username}-${projectFolderName}`,
      agent: {
        type: 'claude-code',
        displayName: 'Claude Code',
        model: historyData.model || 'Claude',
      },
      owner: {
        user: username,
        pid,
      },
      environment: {
        workingDirectory: cwd || projectFolderName,
        repository: gitInfo.repository,
        gitBranch: gitInfo.branch,
        host: getHostnameCached(),
      },
      lifecycle: {
        startTime: historyData.startTime || now,
        lastActivity: historyData.lastActivity || now,
        durationSeconds: historyData.durationSeconds || 0,
      },
      status: isActive ? 'running' : 'idle',
      currentActivity: isActive
        ? historyData.summary || 'Active conversation'
        : `Past: ${cwd || projectFolderName}`,
      usage: historyData.usage,
      filesModified: historyData.filesModified,
      commandsExecuted: historyData.commandsExecuted,
      conversation: historyData.conversation,
      timeline: historyData.timeline,
      logs: historyData.logs,
    };
  }

  /** Attempt to recover the original path from a Claude project folder name.
   *  Claude encodes paths by replacing all non-alphanumeric chars with '-'.
   *  We try replacing '-' with '/' and validate with fs.existsSync. */
  private recoverPath(folderName: string): string | null {
    const candidate = folderName.replace(/-/g, '/');
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
    return null;
  }

  private async extractSessionData(
    projectFolderName: string,
    projectsDir: string
  ): Promise<{
    conversation: ConversationEntry[];
    timeline: ActionTimelineEntry[];
    filesModified: string[];
    commandsExecuted: string[];
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    logs: string[];
    summary?: string;
    model?: string;
    startTime?: string;
    lastActivity?: string;
    durationSeconds?: number;
    fileModifiedAt?: number;
  }> {
    const data: {
      conversation: ConversationEntry[];
      timeline: ActionTimelineEntry[];
      filesModified: string[];
      commandsExecuted: string[];
      usage: { inputTokens: number; outputTokens: number; totalTokens: number };
      logs: string[];
      summary?: string;
      model?: string;
      startTime?: string;
      lastActivity?: string;
      durationSeconds?: number;
      fileModifiedAt?: number;
    } = {
      conversation: [],
      timeline: [],
      filesModified: [],
      commandsExecuted: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      logs: [],
    };

    try {
      const projectPath = path.join(projectsDir, projectFolderName);

      if (!fs.existsSync(projectPath)) return data;

      // Find latest .jsonl file
      const files = fs
        .readdirSync(projectPath)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => ({ name: f, time: fs.statSync(path.join(projectPath, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (files.length === 0) return data;

      data.fileModifiedAt = files[0].time;

      const latestFile = path.join(projectPath, files[0].name);
      // Only tail-read to avoid loading multi-MB conversation logs on every snapshot.
      const content = readFileTailSync(latestFile, 256 * 1024);
      const conversation: ConversationEntry[] = [];
      const timeline: ActionTimelineEntry[] = [];
      const logs: string[] = [];
      const filesModified = new Set<string>();
      const commandsExecuted = new Set<string>();

      const lines = content.trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          const timestamp = item.timestamp || new Date().toISOString();

          // Log every event
          let logMsg = `[${timestamp}] ${item.type}`;
          if (item.message?.model) logMsg += ` (${item.message.model})`;
          logs.push(logMsg);

          if (item.message?.content) {
            const contentSnippet =
              typeof item.message.content === 'string'
                ? item.message.content
                : JSON.stringify(item.message.content);
            logs.push(
              `  > ${contentSnippet.substring(0, 80)}${contentSnippet.length > 80 ? '...' : ''}`
            );
          }

          if (item.type === 'user' || item.type === 'assistant') {
            const msg = item.message;
            let text = '';

            if (typeof msg.content === 'string') {
              text = msg.content;
            } else if (Array.isArray(msg.content)) {
              for (const part of msg.content) {
                if (part.type === 'text') {
                  text += (part.text || '') + '\n';
                } else if (part.type === 'tool_use') {
                  const toolName = part.name;
                  const toolInput = part.input || {};

                  timeline.push({
                    timestamp,
                    action: `Tool Call: ${toolName}`,
                    detail: JSON.stringify(toolInput),
                  });

                  if (toolName === 'write_to_file' || toolName === 'replace_file_content') {
                    if (toolInput.path) filesModified.add(toolInput.path);
                    else if (toolInput.TargetFile) filesModified.add(toolInput.TargetFile);
                  } else if (toolName === 'run_command') {
                    if (toolInput.command) commandsExecuted.add(toolInput.command);
                    else if (toolInput.CommandLine) commandsExecuted.add(toolInput.CommandLine);
                  }
                }
              }
              text = text.trim();
            }

            if (text) {
              conversation.push({
                role: item.type === 'user' ? 'user' : 'assistant',
                content: text,
                timestamp,
              });
            }

            if (item.type === 'assistant' && msg.model && !data.model) {
              data.model = msg.model;
            }

            if (item.type === 'assistant' && msg.usage) {
              data.usage.inputTokens += msg.usage.input_tokens || 0;
              data.usage.outputTokens += msg.usage.output_tokens || 0;
            }
          }
        } catch {
          /* ignore parse errors */
        }
      }

      data.conversation = conversation;
      data.timeline = timeline;
      data.logs = logs;
      data.filesModified = Array.from(filesModified);
      data.commandsExecuted = Array.from(commandsExecuted);
      data.usage.totalTokens = data.usage.inputTokens + data.usage.outputTokens;

      if (conversation.length > 0) {
        data.startTime = conversation[0].timestamp;
        data.lastActivity = conversation[conversation.length - 1].timestamp;
        data.durationSeconds = Math.floor(
          (new Date(data.lastActivity).getTime() - new Date(data.startTime).getTime()) / 1000
        );
        data.summary = 'Active conversation';
      }
    } catch (err) {
      log.debug(`Failed to extract Claude Code session data for ${projectFolderName}`, err);
    }

    return data;
  }
}
