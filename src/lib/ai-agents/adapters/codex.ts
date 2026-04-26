import * as fs from 'fs';
import * as path from 'path';
import {
  execPromise,
  detectGitInfo,
  discoverHomeDirs,
  getHostnameCached,
  readFileHeadAndTailSync,
} from '../process-utils';
import { createLogger } from '@/lib/logger';
import type {
  AgentAdapter,
  AgentSession,
  AgentType,
  ConversationEntry,
  ActionTimelineEntry,
} from '@/modules/ai-agents/types';

const log = createLogger('ai-agents:codex');

// If the latest rollout file was modified within this window, consider the session active
const ACTIVE_THRESHOLD_MS = 120_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class CodexAdapter implements AgentAdapter {
  readonly agentType: AgentType = 'codex';
  readonly displayName = 'Codex CLI';

  async detect(): Promise<AgentSession[]> {
    const sessions: AgentSession[] = [];

    for (const { username, homeDir } of discoverHomeDirs()) {
      const codexDir = path.join(homeDir, '.codex');
      const sessionsDir = path.join(codexDir, 'sessions');
      try {
        if (!fs.existsSync(sessionsDir)) continue;

        const { stdout: fileList } = await execPromise(
          `find "${sessionsDir}" -name "rollout-*.jsonl" -type f`
        );
        const files = fileList
          .trim()
          .split('\n')
          .filter((f) => f.trim())
          .map((f) => ({ path: f, time: fs.statSync(f).mtime.getTime() }))
          .sort((a, b) => b.time - a.time)
          .slice(0, 20);

        for (const fileObj of files) {
          try {
            const session = await this.buildSession(fileObj.path, codexDir, username);
            if (session) sessions.push(session);
          } catch (err) {
            log.debug(`Failed to build session for ${username}:${fileObj.path}`, err);
          }
        }
      } catch (err) {
        log.debug(`Codex detection failed for user ${username}`, err);
      }
    }
    return sessions;
  }

  private async buildSession(
    rolloutPath: string,
    codexDir: string,
    username: string
  ): Promise<AgentSession | null> {
    const historyData = await this.extractSessionData(rolloutPath, codexDir);
    if (historyData.conversation.length === 0) return null;

    const cwd = historyData.cwd;
    const gitInfo = cwd ? await detectGitInfo(cwd) : {};
    const now = new Date().toISOString();
    const fileMtime = fs.statSync(rolloutPath).mtime.getTime();
    const isActive = Date.now() - fileMtime < ACTIVE_THRESHOLD_MS;

    // Attempt to find PID if active
    let pid = 0;
    if (isActive && (cwd || path.basename(rolloutPath))) {
      try {
        const searchPattern = cwd ? cwd : path.basename(rolloutPath);
        const { stdout } = await execPromise(
          `ps aux | grep "codex" | grep "${searchPattern}" | grep -v grep | awk '{print $2}' | head -n 1`
        );
        if (stdout.trim()) {
          pid = parseInt(stdout.trim(), 10);
        }
      } catch {
        /* ignore */
      }
    }

    return {
      id: `codex-${username}-${path.basename(rolloutPath)}`,
      agent: {
        type: 'codex',
        displayName: 'Codex CLI',
        model: historyData.model || 'GPT',
      },
      owner: {
        user: username,
        pid,
      },
      environment: {
        workingDirectory: cwd || 'unknown',
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
        ? historyData.summary || 'Active session'
        : historyData.summary || `Past: ${cwd || path.basename(rolloutPath)}`,
      usage: historyData.usage,
      filesModified: historyData.filesModified,
      commandsExecuted: historyData.commandsExecuted,
      conversation: historyData.conversation,
      timeline: historyData.timeline,
      logs: historyData.logs,
    };
  }

  private async extractSessionData(
    rolloutPath: string,
    codexDir: string
  ): Promise<{
    conversation: ConversationEntry[];
    timeline: ActionTimelineEntry[];
    filesModified: string[];
    commandsExecuted: string[];
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
    logs: string[];
    summary?: string;
    model?: string;
    cwd?: string;
    startTime?: string;
    lastActivity?: string;
    durationSeconds?: number;
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
      cwd?: string;
      startTime?: string;
      lastActivity?: string;
      durationSeconds?: number;
    } = {
      conversation: [],
      timeline: [],
      filesModified: [],
      commandsExecuted: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      logs: [],
    };

    try {
      if (!fs.existsSync(rolloutPath)) return data;

      // Load session summary from index if available
      try {
        const indexPath = path.join(codexDir, 'session_index.jsonl');
        if (fs.existsSync(indexPath)) {
          const rolloutId = path
            .basename(rolloutPath)
            .replace(/^rollout-.*-/, '')
            .replace(/\.jsonl$/, '');
          const indexContent = fs.readFileSync(indexPath, 'utf8');
          for (const line of indexContent.trim().split('\n')) {
            const idx = JSON.parse(line);
            if (idx.id === rolloutId) {
              data.summary = idx.thread_name;
              break;
            }
          }
        }
      } catch {
        /* ignore */
      }

      // Only tail-read to avoid loading multi-MB rollout logs on every snapshot.
      const content = readFileHeadAndTailSync(rolloutPath, 256 * 1024);
      const conversation: ConversationEntry[] = [];
      const timeline: ActionTimelineEntry[] = [];
      const logs: string[] = [];
      const filesModified = new Set<string>();
      const commandsExecuted = new Set<string>();

      for (const line of content.trim().split('\n')) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          const timestamp = evt.timestamp || new Date().toISOString();

          // Log every event
          if (evt.type) {
            logs.push(`[${timestamp}] ${evt.type}`);
          }

          if (evt.type === 'session_meta') {
            if (evt.payload.cwd) data.cwd = evt.payload.cwd;
            if (evt.payload.model_provider) data.model = evt.payload.model_provider.toUpperCase();
          } else if (evt.type === 'event_msg' && evt.payload.type === 'agent_message') {
            conversation.push({
              role: 'assistant',
              content: evt.payload.message,
              timestamp,
            });
          } else if (evt.type === 'response_item') {
            const payload = evt.payload;
            if (payload.type === 'function_call') {
              let args: Record<string, unknown> = {};
              try {
                args = asRecord(
                  typeof payload.arguments === 'string'
                    ? JSON.parse(payload.arguments)
                    : payload.arguments
                );
              } catch {
                /* ignore */
              }

              timeline.push({
                timestamp,
                action: `Action: ${payload.name}`,
                detail: JSON.stringify(args),
              });

              if (payload.name === 'write_file' || payload.name === 'edit_file') {
                if (typeof args.path === 'string') filesModified.add(args.path);
              } else if (payload.name === 'exec_command' || payload.name === 'run_shell') {
                if (typeof args.cmd === 'string') commandsExecuted.add(args.cmd);
              }
            } else if (payload.type === 'message') {
              if (payload.role === 'developer') continue;

              let text = '';
              if (Array.isArray(payload.content)) {
                for (const part of payload.content) {
                  if (part.text) {
                    text += part.text + '\n';
                  }
                  if (part.type === 'tool_use' || part.tool_call) {
                    const tool = part.tool_call || part;
                    timeline.push({
                      timestamp,
                      action: `Action: ${tool.name || 'tool'}`,
                      detail: JSON.stringify(tool.input || {}),
                    });
                    // Extract files/commands if possible
                    if (tool.name === 'write' || tool.name === 'edit') {
                      if (tool.input?.path) filesModified.add(tool.input.path);
                    } else if (tool.name === 'shell' || tool.name === 'run') {
                      if (tool.input?.command) commandsExecuted.add(tool.input.command);
                    }
                  }
                }
                text = text.trim();
              } else if (typeof payload.content === 'string') {
                text = payload.content;
              }

              if (text) {
                conversation.push({
                  role: payload.role === 'user' ? 'user' : 'assistant',
                  content: text,
                  timestamp,
                });
              }

              if (evt.usage) {
                data.usage.inputTokens += evt.usage.prompt_tokens || 0;
                data.usage.outputTokens += evt.usage.completion_tokens || 0;
              }
            }
          }
        } catch {
          /* ignore */
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
      }
    } catch (err) {
      log.debug('Failed to extract Codex session data', err);
    }

    return data;
  }
}
