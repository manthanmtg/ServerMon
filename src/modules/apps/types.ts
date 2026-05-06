export type AppTemplateId = 'nextjs';

export type ManagedAppStatus = 'draft' | 'deploying' | 'running' | 'failed' | 'stopped' | 'unknown';

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

export interface ManagedAppDTO {
  id: string;
  name: string;
  slug: string;
  templateId: AppTemplateId;
  sourcePath: string;
  domain: string;
  port: number;
  commands: AppCommands;
  envVars: Record<string, string>;
  healthCheckPath: string;
  status: ManagedAppStatus;
  currentReleaseId?: string;
  releases: AppRelease[];
  dns?: DnsInstructions;
  createdAt?: string;
  updatedAt?: string;
  lastDeployedAt?: string;
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
  sourcePath: string;
  domain: string;
  port: number;
  commands: AppCommands;
  envVars?: Record<string, string>;
  healthCheckPath?: string;
  templateId?: AppTemplateId;
}
