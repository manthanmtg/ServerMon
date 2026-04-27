import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordAudit, type AuditLogModel } from './audit';

describe('recordAudit', () => {
  let createMock: ReturnType<typeof vi.fn<(doc: Record<string, unknown>) => Promise<unknown>>>;
  let FakeModel: AuditLogModel;

  beforeEach(() => {
    createMock = vi.fn<(doc: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue({});
    FakeModel = { create: createMock };
  });

  it('passes audit=true and level=audit', async () => {
    await recordAudit(FakeModel, { action: 'node.pair' });
    expect(createMock).toHaveBeenCalledTimes(1);
    const doc = createMock.mock.calls[0][0];
    expect(doc.audit).toBe(true);
    expect(doc.level).toBe('audit');
  });

  it('sets eventType to the action', async () => {
    await recordAudit(FakeModel, { action: 'node.rotate' });
    const doc = createMock.mock.calls[0][0];
    expect(doc.eventType).toBe('node.rotate');
  });

  it('defaults service to servermon when not provided', async () => {
    await recordAudit(FakeModel, { action: 'node.pair' });
    const doc = createMock.mock.calls[0][0];
    expect(doc.service).toBe('servermon');
  });

  it('uses explicit service when provided', async () => {
    await recordAudit(FakeModel, {
      action: 'frpc.restart',
      service: 'frpc',
    });
    const doc = createMock.mock.calls[0][0];
    expect(doc.service).toBe('frpc');
  });

  it('defaults message to action when not provided', async () => {
    await recordAudit(FakeModel, { action: 'node.disable' });
    const doc = createMock.mock.calls[0][0];
    expect(doc.message).toBe('node.disable');
  });

  it('uses explicit message when provided', async () => {
    await recordAudit(FakeModel, {
      action: 'node.disable',
      message: 'Disabled by admin',
    });
    const doc = createMock.mock.calls[0][0];
    expect(doc.message).toBe('Disabled by admin');
  });

  it('defaults retentionUntil to ~365 days from now', async () => {
    const before = Date.now();
    await recordAudit(FakeModel, { action: 'x' });
    const after = Date.now();
    const doc = createMock.mock.calls[0][0];
    const retention = doc.retentionUntil;
    expect(retention).toBeInstanceOf(Date);
    if (!(retention instanceof Date)) {
      throw new Error('Expected retentionUntil to be a Date');
    }
    const ms365 = 365 * 24 * 60 * 60 * 1000;
    expect(retention.getTime()).toBeGreaterThanOrEqual(before + ms365 - 1000);
    expect(retention.getTime()).toBeLessThanOrEqual(after + ms365 + 1000);
  });

  it('respects custom retentionDays', async () => {
    const before = Date.now();
    await recordAudit(FakeModel, { action: 'x', retentionDays: 30 });
    const after = Date.now();
    const doc = createMock.mock.calls[0][0];
    const retention = doc.retentionUntil;
    expect(retention).toBeInstanceOf(Date);
    if (!(retention instanceof Date)) {
      throw new Error('Expected retentionUntil to be a Date');
    }
    const ms30 = 30 * 24 * 60 * 60 * 1000;
    expect(retention.getTime()).toBeGreaterThanOrEqual(before + ms30 - 1000);
    expect(retention.getTime()).toBeLessThanOrEqual(after + ms30 + 1000);
  });

  it('forwards nodeId, routeId, correlationId, actorUserId, metadata', async () => {
    await recordAudit(FakeModel, {
      action: 'route.update',
      nodeId: 'node-1',
      routeId: 'route-1',
      correlationId: 'corr-1',
      actorUserId: 'user-1',
      metadata: { foo: 'bar' },
    });
    const doc = createMock.mock.calls[0][0];
    expect(doc.nodeId).toBe('node-1');
    expect(doc.routeId).toBe('route-1');
    expect(doc.correlationId).toBe('corr-1');
    expect(doc.actorUserId).toBe('user-1');
    expect(doc.metadata).toEqual({ foo: 'bar' });
  });
});
