/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  buildDatabaseConnectionDetails,
  getDatabaseDataPath,
  getDatabaseTemplate,
  getDatabaseTemplates,
} from './templates';

describe('database templates', () => {
  it('ships Mongo, Postgres, and MySQL with hardcoded major versions', () => {
    expect(getDatabaseTemplates().map((template) => template.id)).toEqual([
      'mongo',
      'postgres',
      'mysql',
    ]);

    expect(getDatabaseTemplate('mongo')).toMatchObject({
      name: 'MongoDB',
      defaultPort: 27017,
      internalPort: 27017,
      versions: ['7', '8'],
    });
    expect(getDatabaseTemplate('postgres')).toMatchObject({
      name: 'PostgreSQL',
      defaultPort: 5432,
      internalPort: 5432,
      versions: ['15', '16', '17'],
    });
    expect(getDatabaseTemplate('mysql')).toMatchObject({
      name: 'MySQL',
      defaultPort: 3306,
      internalPort: 3306,
      versions: ['8', '9'],
    });
  });

  it('builds stable host data paths under the managed databases root', () => {
    expect(getDatabaseDataPath('mongo1-monho-mongo', '/srv/servermon_databases')).toBe(
      '/srv/servermon_databases/mongo1-monho-mongo/data'
    );
  });

  it('builds masked and unmasked connection details per engine', () => {
    expect(
      buildDatabaseConnectionDetails({
        templateId: 'postgres',
        host: 'db.example.com',
        port: 55432,
        username: 'servermon',
        password: 'secret-pass',
        databaseName: 'analytics',
        sslMode: 'prefer',
      })
    ).toEqual({
      uri: 'postgresql://servermon:secret-pass@db.example.com:55432/analytics?sslmode=prefer',
      maskedUri: 'postgresql://servermon:********@db.example.com:55432/analytics?sslmode=prefer',
      cli: 'psql "postgresql://servermon:********@db.example.com:55432/analytics?sslmode=prefer"',
      host: 'db.example.com',
      port: 55432,
      databaseName: 'analytics',
    });

    expect(
      buildDatabaseConnectionDetails({
        templateId: 'mongo',
        host: '127.0.0.1',
        port: 27017,
        username: 'root',
        password: 'mongo-pass',
        databaseName: 'appdb',
        sslMode: 'disable',
      }).uri
    ).toBe('mongodb://root:mongo-pass@127.0.0.1:27017/appdb?authSource=admin');

    expect(
      buildDatabaseConnectionDetails({
        templateId: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: 'app',
        password: 'mysql-pass',
        databaseName: 'appdb',
        sslMode: 'require',
      }).uri
    ).toBe('mysql://app:mysql-pass@127.0.0.1:3306/appdb?ssl-mode=REQUIRED');
  });
});
