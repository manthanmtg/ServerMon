import { createLogger } from '@/lib/logger';
import { ClaudeCodeAdapter } from './adapters/claude-code';
import { CodexAdapter } from './adapters/codex';
import { OpenCodeAdapter } from './adapters/opencode';
import { GeminiCLIAdapter } from './adapters/gemini-cli';
import { killProcess } from './process-utils';
import { getAgentToolStatuses } from './tool-availability';
import type {
  AgentAdapter,
  AgentSession,
  AgentsSnapshot,
  AgentsSummary,
  ConversationEntry,
  ActionTimelineEntry,
} from '@/modules/ai-agents/types';

const log = createLogger('ai-agents');
const SNAPSHOT_CONVERSATION_LIMIT = 8;
const SNAPSHOT_TIMELINE_LIMIT = 20;
const SNAPSHOT_LOG_LIMIT = 25;
const SNAPSHOT_FILE_LIMIT = 25;
const SNAPSHOT_COMMAND_LIMIT = 25;
const SNAPSHOT_TEXT_LIMIT = 500;

function sessionActivityTime(session: AgentSession): number {
  const lastActivity = new Date(session.lifecycle.lastActivity).getTime();
  if (Number.isFinite(lastActivity)) return lastActivity;
  const startTime = new Date(session.lifecycle.startTime).getTime();
  return Number.isFinite(startTime) ? startTime : 0;
}

function truncateText(value: string, limit = SNAPSHOT_TEXT_LIMIT): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 3)}...`;
}

function takeTail<T>(items: T[] | undefined, limit: number): T[] {
  if (!Array.isArray(items)) return [];
  return items.length > limit ? items.slice(-limit) : [...items];
}

function compactConversation(entries: ConversationEntry[]): ConversationEntry[] {
  return takeTail(entries, SNAPSHOT_CONVERSATION_LIMIT).map((entry) => ({
    ...entry,
    content: truncateText(entry.content),
  }));
}

function compactTimeline(entries: ActionTimelineEntry[]): ActionTimelineEntry[] {
  return takeTail(entries, SNAPSHOT_TIMELINE_LIMIT).map((entry) => ({
    ...entry,
    action: truncateText(entry.action),
    detail: entry.detail ? truncateText(entry.detail) : undefined,
  }));
}

function compactSessionForSnapshot(session: AgentSession): AgentSession {
  return {
    ...session,
    filesModified: takeTail(session.filesModified, SNAPSHOT_FILE_LIMIT),
    commandsExecuted: takeTail(session.commandsExecuted, SNAPSHOT_COMMAND_LIMIT).map((command) =>
      truncateText(command)
    ),
    conversation: compactConversation(session.conversation),
    timeline: compactTimeline(session.timeline),
    logs: takeTail(session.logs, SNAPSHOT_LOG_LIMIT).map((entry) => truncateText(entry)),
  };
}

export class AIAgentsService {
  private adapters: AgentAdapter[] = [];
  private sessionCache: AgentSession[] = [];
  private lastScanTime = 0;
  private hasScanned = false;
  private inFlightScan: Promise<AgentSession[]> | null = null;
  private readonly CACHE_TTL_MS = 15_000;
  private readonly ADAPTER_TIMEOUT_MS = 2_000;

  constructor() {
    this.adapters = [
      new ClaudeCodeAdapter(),
      new CodexAdapter(),
      new OpenCodeAdapter(),
      new GeminiCLIAdapter(),
    ];
    log.info(`Registered ${this.adapters.length} agent adapters`);
  }

  registerAdapter(adapter: AgentAdapter): void {
    this.adapters.push(adapter);
    log.info(`Registered adapter: ${adapter.displayName}`);
  }

  async getSnapshot(): Promise<AgentsSnapshot> {
    const [allSessions, tools] = await Promise.all([this.detectSessions(), getAgentToolStatuses()]);
    const sessions: AgentSession[] = [];
    const pastSessions: AgentSession[] = [];

    for (const session of allSessions) {
      if (session.status === 'running') {
        sessions.push(session);
      } else {
        pastSessions.push(session);
      }
    }

    sessions.sort((a, b) => sessionActivityTime(b) - sessionActivityTime(a));
    pastSessions.sort((a, b) => sessionActivityTime(b) - sessionActivityTime(a));

    const summary = this.computeSummary(allSessions);
    return {
      summary,
      sessions: sessions.map(compactSessionForSnapshot),
      pastSessions: pastSessions.map(compactSessionForSnapshot),
      tools,
      timestamp: new Date().toISOString(),
    };
  }

  async detectSessions(): Promise<AgentSession[]> {
    const now = Date.now();
    if (this.hasScanned && now - this.lastScanTime < this.CACHE_TTL_MS) {
      return this.sessionCache;
    }

    if (this.inFlightScan) {
      return this.inFlightScan;
    }

    this.inFlightScan = this.scanAdapters();
    try {
      return await this.inFlightScan;
    } finally {
      this.inFlightScan = null;
    }
  }

  private async scanAdapters(): Promise<AgentSession[]> {
    const allSessions: AgentSession[] = [];
    const results = await Promise.allSettled(
      this.adapters.map((adapter) => this.detectWithTimeout(adapter))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        allSessions.push(...result.value);
      } else {
        log.warn(`Adapter ${this.adapters[i].displayName} failed`, result.reason);
      }
    }

    this.sessionCache = allSessions;
    this.lastScanTime = Date.now();
    this.hasScanned = true;
    return allSessions;
  }

  private detectWithTimeout(adapter: AgentAdapter): Promise<AgentSession[]> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<AgentSession[]>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Adapter ${adapter.displayName} timed out`));
      }, this.ADAPTER_TIMEOUT_MS);
    });

    return Promise.race([adapter.detect(), timeoutPromise]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  }

  async getSession(sessionId: string): Promise<AgentSession | undefined> {
    const sessions = await this.detectSessions();
    return sessions.find((s) => s.id === sessionId);
  }

  async terminateSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;
    log.info(`Terminating session ${sessionId} (pid: ${session.owner.pid})`);
    const result = await killProcess(session.owner.pid, 'SIGTERM');
    if (result) {
      this.invalidateCache();
    }
    return result;
  }

  async killSession(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;
    log.info(`Killing session ${sessionId} (pid: ${session.owner.pid})`);
    const result = await killProcess(session.owner.pid, 'SIGKILL');
    if (result) {
      this.invalidateCache();
    }
    return result;
  }

  private invalidateCache(): void {
    this.lastScanTime = 0;
    this.hasScanned = false;
    this.sessionCache = [];
  }

  private computeSummary(sessions: AgentSession[]): AgentsSummary {
    return {
      total: sessions.length,
      running: sessions.filter((s) => s.status === 'running').length,
      idle: sessions.filter((s) => s.status === 'idle').length,
      waiting: sessions.filter((s) => s.status === 'waiting').length,
      error: sessions.filter((s) => s.status === 'error').length,
      completed: sessions.filter((s) => s.status === 'completed').length,
    };
  }
}

let _aiAgentsService: AIAgentsService | null = null;
export function getAIAgentsService(): AIAgentsService {
  if (!_aiAgentsService) {
    _aiAgentsService = new AIAgentsService();
  }
  return _aiAgentsService;
}
