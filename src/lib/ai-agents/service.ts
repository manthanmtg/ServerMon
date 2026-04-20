import { createLogger } from '@/lib/logger';
import { ClaudeCodeAdapter } from './adapters/claude-code';
import { CodexAdapter } from './adapters/codex';
import { OpenCodeAdapter } from './adapters/opencode';
import { GeminiCLIAdapter } from './adapters/gemini-cli';
import { killProcess } from './process-utils';
import type {
  AgentAdapter,
  AgentSession,
  AgentsSnapshot,
  AgentsSummary,
} from '@/modules/ai-agents/types';

const log = createLogger('ai-agents');

export class AIAgentsService {
  private adapters: AgentAdapter[] = [];
  private sessionCache: AgentSession[] = [];
  private lastScanTime = 0;
  private readonly CACHE_TTL_MS = 3000;

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
    const allSessions = await this.detectSessions();
    const sessions: AgentSession[] = [];
    const pastSessions: AgentSession[] = [];

    for (const session of allSessions) {
      if (session.status === 'running') {
        sessions.push(session);
      } else {
        pastSessions.push(session);
      }
    }

    // Sort past sessions by created time (newest first)
    pastSessions.sort(
      (a, b) =>
        new Date(b.lifecycle.startTime).getTime() - new Date(a.lifecycle.startTime).getTime()
    );

    const summary = this.computeSummary(allSessions);
    return {
      summary,
      sessions,
      pastSessions,
      timestamp: new Date().toISOString(),
    };
  }

  async detectSessions(): Promise<AgentSession[]> {
    const now = Date.now();
    if (now - this.lastScanTime < this.CACHE_TTL_MS && this.sessionCache.length > 0) {
      return this.sessionCache;
    }

    const allSessions: AgentSession[] = [];
    const results = await Promise.allSettled(this.adapters.map((adapter) => adapter.detect()));

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        allSessions.push(...result.value);
      } else {
        log.warn(`Adapter ${this.adapters[i].displayName} failed`, result.reason);
      }
    }

    this.sessionCache = allSessions;
    this.lastScanTime = now;
    return allSessions;
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
