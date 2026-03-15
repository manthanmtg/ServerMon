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

const log = createLogger('ai-agents:opencode');

// If a session was updated within this window, consider it active
const ACTIVE_THRESHOLD_MS = 120_000;

interface DbSession {
  id: string;
  slug: string;
  title: string;
  directory: string;
  time_created: number;
  time_updated: number;
}

export class OpenCodeAdapter implements AgentAdapter {
  readonly agentType: AgentType = 'opencode';
  readonly displayName = 'OpenCode';

  async detect(): Promise<AgentSession[]> {
    const sessions: AgentSession[] = [];

    for (const { username, homeDir } of discoverHomeDirs()) {
      const dbPath = path.join(homeDir, '.local/share/opencode/opencode.db');
      try {
        if (!fs.existsSync(dbPath)) continue;

        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        const sessionQuery = `SELECT id, slug, title, directory, time_created, time_updated FROM session WHERE time_updated > ${twentyFourHoursAgo} ORDER BY time_updated DESC LIMIT 50;`;
        const { stdout: sessionOut } = await execPromise(
          `sqlite3 -json "${dbPath}" "${sessionQuery}"`
        );

        if (!sessionOut.trim()) continue;

        const dbSessions: DbSession[] = JSON.parse(sessionOut);

        for (const dbSes of dbSessions) {
          try {
            const session = await this.buildSession(dbSes, dbPath, username);
            if (session) sessions.push(session);
          } catch (err) {
            log.debug(`Failed to build session for ${username}:${dbSes.id}`, err);
          }
        }
      } catch (err) {
        log.debug(`OpenCode detection failed for user ${username}`, err);
      }
    }
    return sessions;
  }

  private async buildSession(
    dbSes: DbSession,
    dbPath: string,
    username: string
  ): Promise<AgentSession | null> {
    const gitInfo = await detectGitInfo(dbSes.directory);
    const detailData = await this.extractSessionDetail(dbSes.id, dbPath);
    const isActive = Date.now() - dbSes.time_updated < ACTIVE_THRESHOLD_MS;

    return {
      id: `opencode-${username}-${dbSes.id}`,
      agent: {
        type: 'opencode',
        displayName: 'OpenCode',
        model: detailData.model || 'big-pickle',
      },
      owner: {
        user: username,
        pid: 0,
      },
      environment: {
        workingDirectory: dbSes.directory,
        repository: gitInfo.repository,
        gitBranch: gitInfo.branch,
        host: (await execPromise('hostname').catch(() => ({ stdout: 'localhost' }))).stdout.trim(),
      },
      lifecycle: {
        startTime: new Date(dbSes.time_created).toISOString(),
        lastActivity: new Date(dbSes.time_updated).toISOString(),
        durationSeconds: Math.floor((dbSes.time_updated - dbSes.time_created) / 1000),
      },
      status: isActive ? 'running' : 'idle',
      currentActivity: dbSes.title || dbSes.slug || (isActive ? 'Active session' : 'Past session'),
      resources: { cpuPercent: 0, memoryBytes: 0, memoryPercent: 0 },
      filesModified: detailData.filesModified,
      commandsExecuted: [],
      conversation: detailData.conversation,
      timeline: [],
      logs: [],
    };
  }

  private async extractSessionDetail(
    sessionId: string,
    dbPath: string
  ): Promise<{
    conversation: ConversationEntry[];
    model?: string;
    filesModified: string[];
  }> {
    const data: {
      conversation: ConversationEntry[];
      model?: string;
      filesModified: string[];
    } = {
      conversation: [],
      filesModified: [],
    };

    try {
      // Fetch messages and parts
      const msgQuery = `
                SELECT m.time_created, p.data as part_data, m.data as msg_data
                FROM message m 
                JOIN part p ON m.id = p.message_id 
                WHERE m.session_id = '${sessionId}' 
                ORDER BY m.time_created ASC;
            `;
      const { stdout: msgOut } = await execPromise(`sqlite3 -json "${dbPath}" "${msgQuery}"`);

      if (msgOut.trim()) {
        const rows = JSON.parse(msgOut);
        const conversation: ConversationEntry[] = [];

        for (const row of rows) {
          let role: 'user' | 'assistant' | 'system' = 'system';

          if (row.msg_data) {
            try {
              const msgData = JSON.parse(row.msg_data);
              role = msgData.role || 'assistant';
              if (!data.model) {
                if (typeof msgData.model === 'string') {
                  data.model = msgData.model;
                } else if (msgData.model?.modelID) {
                  data.model = msgData.model.modelID;
                }
              }
            } catch {
              /* ignore */
            }
          }

          try {
            const partData = JSON.parse(row.part_data);
            if (partData.type === 'text' && partData.text) {
              conversation.push({
                role,
                content: partData.text,
                timestamp: new Date(row.time_created).toISOString(),
              });
            }
          } catch {
            /* ignore */
          }
        }
        data.conversation = conversation;
      }
    } catch (err) {
      log.debug('Failed to extract OpenCode session detail', err);
    }

    return data;
  }
}
