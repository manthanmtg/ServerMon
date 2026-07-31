export type AppTemplateId = 'nextjs';

export type ManagedAppStatus = 'draft' | 'deploying' | 'running' | 'failed' | 'stopped' | 'unknown';
export type AppSourceType = 'local' | 'git';
export type AppAutoUpdateStatus = 'idle' | 'updated' | 'unchanged' | 'failed';
export type AppOperationType = 'deploy' | 'update' | 'rollback' | 'delete';
export type AppOperationStatus = 'running' | 'succeeded' | 'failed' | 'unchanged';
export type AppExecutionEngine = 'legacy' | 'v2';
export type AppV2OperationStatus =
  | 'queued'
  | 'running'
  | 'cancel_requested'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'unchanged';
export type AppV2OperationPhase =
  | 'queued'
  | 'claiming'
  | 'preflight'
  | 'source'
  | 'install'
  | 'build'
  | 'stage'
  | 'activate'
  | 'health'
  | 'routing'
  | 'tls'
  | 'finalize'
  | 'cleanup'
  | 'terminal';

export interface AppCommands {
  install: string;
  build: string;
  start: string;
}

export interface AppRelease {
  id: string;
  status: 'building' | 'active' | 'failed' | 'superseded';
  createdAt: string;
  activatedAt?: string;
  error?: string;
  logs: string[];
}

export interface AppOperation {
  id: string;
  type: AppOperationType;
  status: AppOperationStatus;
  title: string;
  step: string;
  startedAt: string;
  deadlineAt?: string;
  completedAt?: string;
  releaseId?: string;
  commitSha?: string;
  error?: string;
  logs: string[];
}

export interface AcceptedAppOperation {
  id: string;
  appId: string;
  type: AppOperationType;
  status: AppV2OperationStatus;
  phase: AppV2OperationPhase;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  workerId?: string;
  error?: string;
}

export interface AppOperationEventDTO {
  operationId: string;
  appId: string;
  sequence: number;
  type: 'created' | 'progress' | 'log' | 'warning' | 'error' | 'status';
  status?: AppV2OperationStatus;
  phase?: AppV2OperationPhase;
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface EnqueuedAppOperationResponse {
  operation: AcceptedAppOperation;
  links: {
    self: string;
    events: string;
    cancel: string;
  };
}

export interface AppLogEntry {
  timestamp: string;
  priority: 'emerg' | 'alert' | 'crit' | 'err' | 'warning' | 'notice' | 'info' | 'debug';
  message: string;
  unit: string;
  pid?: number;
}

export interface AppRuntimeSnapshot {
  available: boolean;
  serviceName: string;
  activeState?: string;
  subState?: string;
  mainPid?: number;
  cpuPercent?: number;
  memoryBytes?: number;
  memoryPercent?: number;
  uptimeSeconds?: number;
  restartCount?: number;
  checkedAt: string;
  error?: string;
}

export interface ManagedAppDTO {
  id: string;
  name: string;
  slug: string;
  templateId: AppTemplateId;
  sourceType: AppSourceType;
  sourcePath?: string;
  git?: {
    url: string;
    branch: string;
    currentSha?: string;
    lastCheckedAt?: string;
    lastUpdatedAt?: string;
    autoUpdate: AppAutoUpdate;
  };
  domain: string;
  port: number;
  commands: AppCommands;
  envVars: Record<string, string>;
  healthCheckPath: string;
  tlsEnabled: boolean;
  status: ManagedAppStatus;
  runtime?: AppRuntimeSnapshot;
  currentReleaseId?: string;
  releases: AppRelease[];
  operations: AppOperation[];
  dns?: DnsInstructions;
  createdAt?: string;
  updatedAt?: string;
  lastDeployedAt?: string;
}

export interface AppAutoUpdate {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: AppAutoUpdateStatus;
  lastError?: string;
}

export interface AppTemplate {
  id: AppTemplateId;
  name: string;
  description: string;
  defaultHealthCheckPath: string;
  requiredCommands: Array<keyof AppCommands>;
  todos: string[];
}

export interface DnsInstructions {
  type: 'A';
  name: string;
  value: string;
  summary: string;
}

export interface CreateManagedAppInput {
  name: string;
  sourceType?: AppSourceType;
  sourcePath?: string;
  gitUrl?: string;
  gitBranch?: string;
  autoUpdate?: {
    enabled?: boolean;
    intervalMinutes?: number;
  };
  domain: string;
  port: number;
  commands: AppCommands;
  envVars?: Record<string, string>;
  healthCheckPath?: string;
  tlsEnabled?: boolean;
  templateId?: AppTemplateId;
}
