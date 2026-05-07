export type DatabaseTemplateId = 'mongo' | 'postgres' | 'mysql';
export type ManagedDatabaseStatus =
  | 'draft'
  | 'deploying'
  | 'running'
  | 'stopped'
  | 'failed'
  | 'unknown';
export type DatabaseSslMode = 'disable' | 'prefer' | 'require';
export type DatabaseRestartPolicy = 'unless-stopped' | 'always' | 'on-failure' | 'no';
export type DatabaseRuntimeAction = 'start' | 'stop' | 'restart';

export interface DatabaseTemplate {
  id: DatabaseTemplateId;
  name: string;
  description: string;
  image: string;
  versions: string[];
  defaultVersion: string;
  defaultPort: number;
  internalPort: number;
  dataMountPath: string;
  defaultUsername: string;
  defaultDatabaseName: string;
}

export interface DatabaseConnectionDetails {
  uri?: string;
  maskedUri: string;
  cli: string;
  host: string;
  port: number;
  databaseName: string;
}

export interface ManagedDatabaseDTO {
  id: string;
  name: string;
  slug: string;
  templateId: DatabaseTemplateId;
  version: string;
  image: string;
  host: string;
  port: number;
  internalPort: number;
  username: string;
  databaseName: string;
  dataPath: string;
  publicRoute: boolean;
  bindAddress: '127.0.0.1' | '0.0.0.0';
  sslMode: DatabaseSslMode;
  restartPolicy: DatabaseRestartPolicy;
  status: ManagedDatabaseStatus;
  containerId?: string;
  containerName?: string;
  connection: DatabaseConnectionDetails;
  securityNotes: string[];
  logs: string[];
  createdAt?: string;
  updatedAt?: string;
  lastDeployedAt?: string;
}

export interface CreateManagedDatabaseInput {
  name: string;
  templateId: DatabaseTemplateId;
  version: string;
  port: number;
  username: string;
  password: string;
  databaseName: string;
  publicRoute: boolean;
  publicHost?: string;
  sslMode: DatabaseSslMode;
  restartPolicy?: DatabaseRestartPolicy;
  extraEnv?: Record<string, string>;
}
