/** @vitest-environment node */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveServerMonBridgeToken } from '@/lib/fleet/servermonBridge';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  listManagedDatabases: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/databases/service', () => ({
  listManagedDatabases: mocks.listManagedDatabases,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

function bridgeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://127.0.0.1:8912/api/fleet/public/servermon-bridge', {
    headers: {
      host: '127.0.0.1:8912',
      ...headers,
    },
  });
}

describe('servermon bridge public route', () => {
  beforeEach(() => {
    mocks.listManagedDatabases.mockReset();
    mocks.listManagedDatabases.mockResolvedValue([]);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'route-secret');
    vi.stubEnv('PORT', '8912');
    vi.stubEnv('SERVERMON_AGENT_BRIDGE_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('publishes bridge capabilities for loopback requests with the derived app token', async () => {
    const res = await GET(
      bridgeRequest({
        'x-servermon-agent-bridge-token': deriveServerMonBridgeToken('route-secret'),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      schemaVersion: 1,
      app: {
        running: true,
        port: 8912,
      },
    });
    expect(mocks.listManagedDatabases).toHaveBeenCalled();
  });

  it('rejects missing bridge tokens in production', async () => {
    const res = await GET(bridgeRequest());

    expect(res.status).toBe(401);
    expect(mocks.listManagedDatabases).not.toHaveBeenCalled();
  });

  it('rejects non-loopback requests even when the bridge token is valid', async () => {
    const res = await GET(
      new NextRequest('http://example.com/api/fleet/public/servermon-bridge', {
        headers: {
          host: 'example.com',
          'x-servermon-agent-bridge-token': deriveServerMonBridgeToken('route-secret'),
        },
      })
    );

    expect(res.status).toBe(401);
    expect(mocks.listManagedDatabases).not.toHaveBeenCalled();
  });
});
