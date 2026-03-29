export type AgentType = 'claude-code' | 'codex' | 'opencode' | 'aider' | 'gemini-cli' | 'custom';

export type SessionStatus = 'running' | 'idle' | 'waiting' | 'error' | 'completed';

export interface AgentIdentity {
  type: AgentType;
  version?: string;
  model?: string;
  displayName: string;
}

export interface SessionOwner {
  user: string;
  pid: number;
}

export interface WorkingEnvironment {
  workingDirectory: string;
  repository?: string;
  gitBranch?: string;
  host: string;
}

export interface SessionLifecycle {
  startTime: string;
  lastActivity: string;
  endTime?: string;
  durationSeconds: number;
}

export interface SessionResourceUsage {
  cpuPercent: number;
  memoryBytes: number;
  memoryPercent: number;
}

export interface ConversationEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ActionTimelineEntry {
  timestamp: string;
  action: string;
  detail?: string;
}

export interface AgentSession {
  id: string;
  agent: AgentIdentity;
  owner: SessionOwner;
  environment: WorkingEnvironment;
  lifecycle: SessionLifecycle;
  status: SessionStatus;
  currentActivity?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  filesModified: string[];
  commandsExecuted: string[];
  conversation: ConversationEntry[];
  timeline: ActionTimelineEntry[];
  logs: string[];
}

export interface AgentsSummary {
  total: number;
  running: number;
  idle: number;
  waiting: number;
  error: number;
  completed: number;
}

export interface AgentsSnapshot {
  summary: AgentsSummary;
  sessions: AgentSession[];
  pastSessions: AgentSession[];
  timestamp: string;
}

export interface AgentAdapter {
  readonly agentType: AgentType;
  readonly displayName: string;
  detect(): Promise<AgentSession[]>;
}
