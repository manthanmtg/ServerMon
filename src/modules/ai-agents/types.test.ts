/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  AgentType,
  SessionStatus,
  AgentIdentity,
  SessionOwner,
  WorkingEnvironment,
  SessionLifecycle,
  SessionResourceUsage,
  ConversationEntry,
  ActionTimelineEntry,
  AgentSession,
  AgentsSummary,
  AgentsSnapshot,
  AgentToolStatus,
} from './types';

describe('ai-agents type shapes', () => {
  it('AgentType accepts valid agent type strings', () => {
    const types: AgentType[] = [
      'claude-code',
      'codex',
      'opencode',
      'aider',
      'gemini-cli',
      'custom',
    ];
    expect(types).toHaveLength(6);
  });

  it('SessionStatus accepts valid status strings', () => {
    const statuses: SessionStatus[] = ['running', 'idle', 'waiting', 'error', 'completed'];
    expect(statuses).toHaveLength(5);
  });

  it('AgentIdentity object can be constructed', () => {
    const identity: AgentIdentity = {
      type: 'claude-code',
      displayName: 'Claude Code',
      version: '1.0',
      model: 'claude-3-5-sonnet',
    };
    expect(identity.type).toBe('claude-code');
    expect(identity.displayName).toBe('Claude Code');
  });

  it('AgentIdentity optional fields can be omitted', () => {
    const identity: AgentIdentity = {
      type: 'custom',
      displayName: 'My Agent',
    };
    expect(identity.version).toBeUndefined();
    expect(identity.model).toBeUndefined();
  });

  it('SessionOwner has user and pid', () => {
    const owner: SessionOwner = { user: 'root', pid: 1234 };
    expect(owner.user).toBe('root');
    expect(owner.pid).toBe(1234);
  });

  it('WorkingEnvironment can include optional fields', () => {
    const env: WorkingEnvironment = {
      workingDirectory: '/home/user/project',
      host: 'localhost',
      repository: 'git@github.com:org/repo.git',
      gitBranch: 'main',
    };
    expect(env.workingDirectory).toBe('/home/user/project');
    expect(env.gitBranch).toBe('main');
  });

  it('WorkingEnvironment optional fields can be omitted', () => {
    const env: WorkingEnvironment = {
      workingDirectory: '/tmp',
      host: 'server1',
    };
    expect(env.repository).toBeUndefined();
    expect(env.gitBranch).toBeUndefined();
  });

  it('SessionLifecycle has required timing fields', () => {
    const lifecycle: SessionLifecycle = {
      startTime: '2026-01-01T00:00:00Z',
      lastActivity: '2026-01-01T00:05:00Z',
      durationSeconds: 300,
    };
    expect(lifecycle.durationSeconds).toBe(300);
    expect(lifecycle.endTime).toBeUndefined();
  });

  it('SessionResourceUsage tracks cpu and memory', () => {
    const usage: SessionResourceUsage = {
      cpuPercent: 15.5,
      memoryBytes: 256 * 1024 * 1024,
      memoryPercent: 3.2,
    };
    expect(usage.cpuPercent).toBe(15.5);
    expect(usage.memoryBytes).toBeGreaterThan(0);
  });

  it('ConversationEntry has role, content, and timestamp', () => {
    const entry: ConversationEntry = {
      role: 'user',
      content: 'Hello',
      timestamp: '2026-01-01T00:00:00Z',
    };
    expect(entry.role).toBe('user');
    const roles: ConversationEntry['role'][] = ['user', 'assistant', 'system'];
    expect(roles).toContain(entry.role);
  });

  it('ActionTimelineEntry has required fields', () => {
    const entry: ActionTimelineEntry = {
      timestamp: '2026-01-01T00:00:00Z',
      action: 'read_file',
      detail: 'src/index.ts',
    };
    expect(entry.action).toBe('read_file');
  });

  it('AgentSession can be constructed with all fields', () => {
    const session: AgentSession = {
      id: 'session-1',
      agent: { type: 'claude-code', displayName: 'Claude Code' },
      owner: { user: 'alice', pid: 42 },
      environment: { workingDirectory: '/app', host: 'localhost' },
      lifecycle: {
        startTime: '2026-01-01T00:00:00Z',
        lastActivity: '2026-01-01T00:05:00Z',
        durationSeconds: 300,
      },
      status: 'running' as const,
      filesModified: ['src/index.ts'],
      commandsExecuted: ['pnpm test'],
      conversation: [],
      timeline: [],
      logs: [],
    };
    expect(session.id).toBe('session-1');
    expect(session.status).toBe('running');
  });

  it('AgentsSummary counts all status types', () => {
    const summary: AgentsSummary = {
      total: 10,
      running: 3,
      idle: 4,
      waiting: 1,
      error: 1,
      completed: 1,
    };
    expect(summary.total).toBe(10);
    expect(
      summary.running + summary.idle + summary.waiting + summary.error + summary.completed
    ).toBe(10);
  });

  it('AgentToolStatus records CLI availability', () => {
    const status: AgentToolStatus = {
      type: 'claude-code',
      displayName: 'Claude Code',
      command: 'claude',
      installed: false,
      checkedAt: '2026-01-01T00:00:00Z',
      error: 'claude: command not found',
    };
    expect(status.installed).toBe(false);
    expect(status.command).toBe('claude');
  });

  it('AgentsSnapshot wraps summary and sessions', () => {
    const snapshot: AgentsSnapshot = {
      summary: { total: 0, running: 0, idle: 0, waiting: 0, error: 0, completed: 0 },
      sessions: [],
      pastSessions: [],
      tools: [],
      timestamp: '2026-01-01T00:00:00Z',
    };
    expect(snapshot.sessions).toHaveLength(0);
    expect(snapshot.pastSessions).toHaveLength(0);
  });
});
