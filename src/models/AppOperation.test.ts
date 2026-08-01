import { describe, expect, it } from 'vitest';
import AppOperation from './AppOperation';
import AppOperationEvent from './AppOperationEvent';
import AppRelease from './AppRelease';
import AppsWorkerHeartbeat from './AppsWorkerHeartbeat';
import ManagedApp from './ManagedApp';

type SchemaIndex = ReturnType<typeof AppOperation.schema.indexes>[number];

function findIndex(indexes: SchemaIndex[], fields: Record<string, 1 | -1>) {
  return indexes.find((entry) => {
    const [indexFields] = entry;
    return JSON.stringify(indexFields) === JSON.stringify(fields);
  });
}

describe('Apps v2 models', () => {
  it('defines the AppOperation queue schema and reliability indexes', () => {
    const statusPath = AppOperation.schema.path('status');
    const phasePath = AppOperation.schema.path('phase');
    const typePath = AppOperation.schema.path('type');
    const indexes = AppOperation.schema.indexes();

    expect(typePath.options.enum).toEqual(['deploy', 'update', 'rollback', 'delete']);
    expect(statusPath.options.enum).toEqual([
      'queued',
      'running',
      'cancel_requested',
      'succeeded',
      'failed',
      'cancelled',
      'unchanged',
    ]);
    expect(phasePath.options.default).toBe('queued');

    expect(findIndex(indexes, { operationId: 1 })?.[1]).toMatchObject({ unique: true });
    expect(findIndex(indexes, { appId: 1, active: 1 })?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { active: true },
    });
    expect(findIndex(indexes, { appId: 1, idempotencyKey: 1 })?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: 'string' } },
    });
    expect(findIndex(indexes, { status: 1, active: 1, createdAt: 1 })).toBeDefined();
  });

  it('accepts an explicitly enabled aggregation pipeline for atomic recovery updates', () => {
    expect(() =>
      AppOperation.findOneAndUpdate(
        { active: true },
        [{ $set: { active: false, status: 'failed' } }],
        { updatePipeline: true }
      )
    ).not.toThrow();
  });

  it('defines ordered operation event indexes with retention', () => {
    const indexes = AppOperationEvent.schema.indexes();

    expect(findIndex(indexes, { operationId: 1, sequence: 1 })?.[1]).toMatchObject({
      unique: true,
    });
    expect(findIndex(indexes, { createdAt: 1 })?.[1]).toMatchObject({
      expireAfterSeconds: 60 * 60 * 24 * 90,
    });
  });

  it('defines release metadata indexes independently from ManagedApp releases', () => {
    const indexes = AppRelease.schema.indexes();

    expect(findIndex(indexes, { appId: 1, releaseId: 1 })?.[1]).toMatchObject({
      unique: true,
    });
    expect(findIndex(indexes, { appId: 1, createdAt: -1 })).toBeDefined();
  });

  it('defines worker heartbeat identity and liveness indexes', () => {
    const statusPath = AppsWorkerHeartbeat.schema.path('status');
    const indexes = AppsWorkerHeartbeat.schema.indexes();

    expect(statusPath.options.enum).toEqual([
      'starting',
      'running',
      'draining',
      'stopped',
      'failed',
    ]);
    expect(findIndex(indexes, { workerId: 1 })?.[1]).toMatchObject({ unique: true });
    expect(findIndex(indexes, { lastSeenAt: -1 })).toBeDefined();
  });

  it('adds v2 migration fields to ManagedApp without removing legacy history arrays', () => {
    expect(ManagedApp.schema.path('executionEngine').options.default).toBe('legacy');
    expect(ManagedApp.schema.path('configVersion').options.default).toBe(1);
    expect(ManagedApp.schema.path('activeReleaseId')).toBeDefined();
    expect(ManagedApp.schema.path('deletingAt')).toBeDefined();
    expect(ManagedApp.schema.path('deletedAt')).toBeDefined();
    expect(ManagedApp.schema.path('migrationVersion').options.default).toBe(0);
    expect(ManagedApp.schema.path('operations')).toBeDefined();
    expect(ManagedApp.schema.path('releases')).toBeDefined();
  });
});
