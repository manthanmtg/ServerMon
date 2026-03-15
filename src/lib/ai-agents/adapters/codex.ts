import * as fs from 'fs';
import * as path from 'path';
import { execPromise, detectGitInfo, discoverHomeDirs } from '../process-utils';
import { createLogger } from '@/lib/logger';
import type {
  AgentAdapter,
  AgentSession,
  AgentType,
  ConversationEntry,
} from '@/modules/ai-agents/types';

const log = createLogger('ai-agents:codex');

// If the latest rollout file was modified within this window, consider the session active
const ACTIVE_THRESHOLD_MS = 120_000;

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

    return {
      id: `codex-${username}-${path.basename(rolloutPath)}`,
      agent: {
        type: 'codex',
        displayName: 'Codex CLI',
        model: historyData.model || 'GPT',
      },
      owner: {
        user: username,
        pid: 0,
      },
      environment: {
        workingDirectory: cwd || 'unknown',
        repository: gitInfo.repository,
        gitBranch: gitInfo.branch,
        host: (await execPromise('hostname').catch(() => ({ stdout: 'localhost' }))).stdout.trim(),
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
      resources: { cpuPercent: 0, memoryBytes: 0, memoryPercent: 0 },
      filesModified: [],
      commandsExecuted: [],
      conversation: historyData.conversation,
      timeline: [],
      logs: [],
    };
  }

  private async extractSessionData(
    rolloutPath: string,
    codexDir: string
  ): Promise<{
    conversation: ConversationEntry[];
    summary?: string;
    model?: string;
    cwd?: string;
    startTime?: string;
    lastActivity?: string;
    durationSeconds?: number;
  }> {
    const data: {
      conversation: ConversationEntry[];
      summary?: string;
      model?: string;
      cwd?: string;
      startTime?: string;
      lastActivity?: string;
      durationSeconds?: number;
    } = {
      conversation: [],
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

      const content = fs.readFileSync(rolloutPath, 'utf8');
      const conversation: ConversationEntry[] = [];

      for (const line of content.trim().split('\n')) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === 'session_meta') {
            if (evt.payload.cwd) data.cwd = evt.payload.cwd;
            if (evt.payload.model_provider) data.model = evt.payload.model_provider.toUpperCase();
          } else if (evt.type === 'response_item' && evt.payload.type === 'message') {
            const payload = evt.payload;
            if (payload.role === 'developer') continue; // Skip system-like prompt messages

            let text = '';
            if (Array.isArray(payload.content)) {
              text = (payload.content as Array<{ text?: string }>)
                .map((c) => c.text || '')
                .join('\n')
                .trim();
            } else if (typeof payload.content === 'string') {
              text = payload.content;
            }

            if (text) {
              conversation.push({
                role: payload.role === 'user' ? 'user' : 'assistant',
                content: text,
                timestamp: evt.timestamp || new Date().toISOString(),
              });
            }
          }
        } catch {
          /* ignore */
        }
      }

      data.conversation = conversation;
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
