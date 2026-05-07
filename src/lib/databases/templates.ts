import path from 'node:path';
import type {
  DatabaseConnectionDetails,
  DatabaseSslMode,
  DatabaseTemplate,
  DatabaseTemplateId,
} from '@/modules/databases/types';

const DATABASE_TEMPLATES: Record<DatabaseTemplateId, DatabaseTemplate> = {
  mongo: {
    id: 'mongo',
    name: 'MongoDB',
    description: 'Document database for JSON-style application data.',
    image: 'mongo',
    versions: ['7', '8'],
    defaultVersion: '8',
    defaultPort: 27017,
    internalPort: 27017,
    dataMountPath: '/data/db',
    defaultUsername: 'root',
    defaultDatabaseName: 'appdb',
  },
  postgres: {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Relational database with strong SQL and transactional guarantees.',
    image: 'postgres',
    versions: ['15', '16', '17'],
    defaultVersion: '17',
    defaultPort: 5432,
    internalPort: 5432,
    dataMountPath: '/var/lib/postgresql/data',
    defaultUsername: 'servermon',
    defaultDatabaseName: 'servermon',
  },
  mysql: {
    id: 'mysql',
    name: 'MySQL',
    description: 'Relational database for common web application workloads.',
    image: 'mysql',
    versions: ['8', '9'],
    defaultVersion: '8',
    defaultPort: 3306,
    internalPort: 3306,
    dataMountPath: '/var/lib/mysql',
    defaultUsername: 'servermon',
    defaultDatabaseName: 'servermon',
  },
};

export function getDatabaseTemplates(): DatabaseTemplate[] {
  return [DATABASE_TEMPLATES.mongo, DATABASE_TEMPLATES.postgres, DATABASE_TEMPLATES.mysql];
}

export function getDatabaseTemplate(id: DatabaseTemplateId): DatabaseTemplate {
  return DATABASE_TEMPLATES[id];
}

export function getDatabasesRoot(): string {
  return process.env.SERVERMON_DATABASES_ROOT || '/var/lib/servermon/databases';
}

export function getDatabaseDataPath(slug: string, root = getDatabasesRoot()): string {
  return path.join(root, slug, 'data');
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function withSslMode(
  uri: string,
  templateId: DatabaseTemplateId,
  sslMode: DatabaseSslMode
): string {
  if (sslMode === 'disable') return uri;
  if (templateId === 'postgres') return `${uri}?sslmode=${sslMode}`;
  if (templateId === 'mysql' && sslMode === 'require') return `${uri}?ssl-mode=REQUIRED`;
  if (templateId === 'mongo' && sslMode === 'require') return `${uri}&tls=true`;
  return uri;
}

export function buildDatabaseConnectionDetails(input: {
  templateId: DatabaseTemplateId;
  host: string;
  port: number;
  username: string;
  password: string;
  databaseName: string;
  sslMode: DatabaseSslMode;
  includeSecret?: boolean;
}): DatabaseConnectionDetails {
  const includeSecret = input.includeSecret ?? true;
  const rawSecret = input.password;
  const auth = `${encode(input.username)}:${encode(rawSecret)}@${input.host}:${input.port}`;
  const maskedAuth = `${encode(input.username)}:********@${input.host}:${input.port}`;

  let uri: string;
  let maskedUri: string;
  if (input.templateId === 'mongo') {
    uri = `mongodb://${auth}/${encode(input.databaseName)}?authSource=admin`;
    maskedUri = `mongodb://${maskedAuth}/${encode(input.databaseName)}?authSource=admin`;
  } else if (input.templateId === 'postgres') {
    uri = `postgresql://${auth}/${encode(input.databaseName)}`;
    maskedUri = `postgresql://${maskedAuth}/${encode(input.databaseName)}`;
  } else {
    uri = `mysql://${auth}/${encode(input.databaseName)}`;
    maskedUri = `mysql://${maskedAuth}/${encode(input.databaseName)}`;
  }

  uri = withSslMode(uri, input.templateId, input.sslMode);
  maskedUri = withSslMode(maskedUri, input.templateId, input.sslMode);

  return {
    ...(includeSecret ? { uri } : {}),
    maskedUri,
    cli: input.templateId === 'postgres' ? `psql "${maskedUri}"` : maskedUri,
    host: input.host,
    port: input.port,
    databaseName: input.databaseName,
  };
}
