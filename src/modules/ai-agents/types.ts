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
  thoughts?: Array<{ subject: string; description: string; timestamp: string }>;
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
  usage?: {
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

export interface AgentToolStatus {
  type: AgentType;
  displayName: string;
  command: string;
  installed: boolean;
  path?: string;
  version?: string;
  checkedAt: string;
  error?: string;
}

export interface AgentsSnapshot {
  summary: AgentsSummary;
  sessions: AgentSession[];
  pastSessions: AgentSession[];
  tools: AgentToolStatus[];
  timestamp: string;
}

export interface AgentAdapter {
  readonly agentType: AgentType;
  readonly displayName: string;
  detect(): Promise<AgentSession[]>;
}

export interface GeminiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface GeminiMessage {
  id: string;
  timestamp: string;
  type: 'user' | 'gemini' | 'system' | 'info';
  content: string | Array<{ text: string }>;
  model?: string;
  thoughts?: Array<{ subject: string; description: string; timestamp: string }>;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  toolCalls?: GeminiToolCall[];
}

export interface GeminiSession {
  sessionId: string;
  projectHash: string;
  startTime: string;
  lastUpdated: string;
  messages: GeminiMessage[];
  summary?: string;
}

export interface GeminiLogEntry {
  sessionId: string;
  message: string;
  type: string;
  timestamp: string;
}
