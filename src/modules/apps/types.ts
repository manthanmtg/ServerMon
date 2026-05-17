export type AppTemplateId = 'nextjs';

export type ManagedAppStatus = 'draft' | 'deploying' | 'running' | 'failed' | 'stopped' | 'unknown';
export type AppSourceType = 'local' | 'git';
export type AppAutoUpdateStatus = 'idle' | 'updated' | 'unchanged' | 'failed';
export type AppOperationType = 'deploy' | 'update' | 'rollback' | 'delete';
export type AppOperationStatus = 'running' | 'succeeded' | 'failed' | 'unchanged';

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
  completedAt?: string;
  releaseId?: string;
  commitSha?: string;
  error?: string;
  logs: string[];
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
