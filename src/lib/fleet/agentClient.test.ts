import { describe, it, expect, vi } from 'vitest';
import { AgentClient } from './agentClient';
import type { AgentPtyBridge } from './agentPtyBridge';
import type { FrpHandle } from './frpProcess';

interface FakeBridge {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
}

function makeFakeBridge(): FakeBridge {
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    status: vi.fn(() => ({ running: true, sessionCount: 0 })),
  };
}

function makeFakeFrpHandle(): FrpHandle & { _killCalls: number } {
  const state = { _killCalls: 0 };
  const handle = {
    pid: 4242,
    kill: vi.fn(async () => {
      state._killCalls += 1;
    }),
    onExit: new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(() => {}),
  } as unknown as FrpHandle & { _killCalls: number };
  Object.defineProperty(handle, '_killCalls', {
    get: () => state._killCalls,
  });
  return handle;
}

function mkOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function mkErrorResponse(status: number, body: unknown = { error: 'fail' }): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function defaultNodeConfig(): unknown {
  return {
    slug: 'node-1',
    frpcConfig: {
      protocol: 'tcp',
      tlsEnabled: true,
      tlsVerify: true,
      transportEncryptionEnabled: true,
      compressionEnabled: false,
      heartbeatInterval: 30,
      heartbeatTimeout: 90,
      poolCount: 1,
      advanced: {},
    },
    proxyRules: [],
  };
}

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('AgentClient', () => {
  it('start() pairs, fetches node, ensures binary, writes toml, spawns frpc, and starts bridge', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.endsWith('/pair')) {
        return mkOkResponse({
          hub: {
            serverAddr: 'hub.example.com',
            serverPort: 7000,
            authToken: 'hub-token',
            subdomainHost: 'hub.example.com',
          },
        });
      }
      if (u.endsWith('/api/fleet/nodes/node-1')) {
        return mkOkResponse(defaultNodeConfig());
      }
      if (u.endsWith('/heartbeat')) {
        return mkOkResponse({ ok: true });
      }
      throw new Error(`Unexpected URL ${u}`);
    });

    const ensureBinaryImpl = vi.fn(async () => ({
      frps: '/tmp/cache/frps',
      frpc: '/tmp/cache/frpc',
    }));
    const frpHandle = makeFakeFrpHandle();
    const startFrpcImpl = vi.fn(() => frpHandle);
    const writeFile = vi.fn(async () => {});
    const mkdir = vi.fn(async () => {});
    const bridge = makeFakeBridge();
    const ptyBridgeFactory = vi.fn(() => bridge as unknown as AgentPtyBridge);
    const setIntervalImpl = vi.fn(() => 123 as unknown as ReturnType<typeof setInterval>);
    const clearIntervalImpl = vi.fn();

    const client = new AgentClient({
      hubUrl: 'https://hub.example.com',
      pairingToken: 'pair-token',
      nodeId: 'node-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ensureBinaryImpl,
      startFrpcImpl,
      writeFile,
      mkdir,
      ptyBridgeFactory,
      setIntervalImpl: setIntervalImpl as unknown as typeof setInterval,
      clearIntervalImpl: clearIntervalImpl as unknown as typeof clearInterval,
    });

    await client.start();

    // Pair + node config fetches in order
    const calls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toBe('https://hub.example.com/api/fleet/nodes/node-1/pair');
    expect(calls[1]).toBe('https://hub.example.com/api/fleet/nodes/node-1');

    // Authorization bearer in pair call
    const pairCall = fetchImpl.mock.calls[0] as unknown as [string, RequestInit | undefined];
    const pairInit = pairCall[1];
    expect(pairInit?.method).toBe('POST');
    const headers = pairInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer pair-token');

    // ensureBinary called
    expect(ensureBinaryImpl).toHaveBeenCalled();

    // frpc.toml written
    expect(writeFile).toHaveBeenCalled();
    const writeArgs = writeFile.mock.calls[0] as unknown as [string, string];
    expect(writeArgs[0]).toContain('frpc.toml');
    expect(writeArgs[1]).toContain('serverAddr');

    // startFrpc called with binary/config path
    expect(startFrpcImpl).toHaveBeenCalled();
    const startCall = startFrpcImpl.mock.calls[0] as unknown as [
      { binary: string; configPath: string },
    ];
    const startArgs = startCall[0];
    expect(startArgs.binary).toBe('/tmp/cache/frpc');
    expect(startArgs.configPath).toContain('frpc.toml');

    // bridge factory + start
    expect(ptyBridgeFactory).toHaveBeenCalled();
    expect(bridge.start).toHaveBeenCalled();

    // heartbeat interval scheduled
    expect(setIntervalImpl).toHaveBeenCalled();

    // Status is reconnecting until frpc logs a successful connection.
    const status = client.status();
    expect(status.paired).toBe(true);
    expect(status.tunnelStatus).toBe('reconnecting');
    expect(status.bridgeRunning).toBe(true);
    expect(status.frpcPid).toBe(4242);

    await client.stop();
  });

  it('start() sets tunnelStatus=auth_failed and throws when pairing returns non-200', async () => {
    const fetchImpl = vi.fn(async () => mkErrorResponse(401, { error: 'unauthorized' }));
    const client = new AgentClient({
      hubUrl: 'https://hub.example.com',
      pairingToken: 'bad',
      nodeId: 'node-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ensureBinaryImpl: vi.fn(),
      startFrpcImpl: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      ptyBridgeFactory: () => makeFakeBridge() as unknown as AgentPtyBridge,
      setIntervalImpl: vi.fn() as unknown as typeof setInterval,
      clearIntervalImpl: vi.fn() as unknown as typeof clearInterval,
    });
    await expect(client.start()).rejects.toThrow();
    expect(client.status().tunnelStatus).toBe('auth_failed');
    expect(client.status().paired).toBe(false);
  });

  it('stop() kills frpc, stops bridge, and clears heartbeat interval', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.endsWith('/pair')) {
        return mkOkResponse({
          hub: {
            serverAddr: 'hub.example.com',
            serverPort: 7000,
            authToken: 'hub-token',
            subdomainHost: 'hub.example.com',
          },
        });
      }
      if (u.endsWith('/api/fleet/nodes/node-1')) {
        return mkOkResponse(defaultNodeConfig());
      }
      if (u.endsWith('/heartbeat')) {
        return mkOkResponse({ ok: true });
      }
      throw new Error(`Unexpected URL ${u}`);
    });
    const frpHandle = makeFakeFrpHandle();
    const bridge = makeFakeBridge();
    const clearIntervalImpl = vi.fn();
    const client = new AgentClient({
      hubUrl: 'https://hub.example.com',
      pairingToken: 'pair-token',
      nodeId: 'node-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ensureBinaryImpl: vi.fn(async () => ({
        frps: '/tmp/cache/frps',
        frpc: '/tmp/cache/frpc',
      })),
      startFrpcImpl: vi.fn(() => frpHandle),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      ptyBridgeFactory: () => bridge as unknown as AgentPtyBridge,
      setIntervalImpl: vi.fn(
        () => 999 as unknown as ReturnType<typeof setInterval>
      ) as unknown as typeof setInterval,
      clearIntervalImpl: clearIntervalImpl as unknown as typeof clearInterval,
    });

    await client.start();
    await client.stop();

    expect(frpHandle.kill).toHaveBeenCalled();
    expect(bridge.stop).toHaveBeenCalled();
    expect(clearIntervalImpl).toHaveBeenCalledWith(999);
  });

  it('heartbeat interval posts to /heartbeat with bearer token and capabilities', async () => {
    const heartbeatCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(
      async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.endsWith('/pair')) {
          return mkOkResponse({
            hub: {
              serverAddr: 'hub.example.com',
              serverPort: 7000,
              authToken: 'hub-token',
              subdomainHost: 'hub.example.com',
            },
          });
        }
        if (u.endsWith('/api/fleet/nodes/node-1')) {
          return mkOkResponse(defaultNodeConfig());
        }
        if (u.endsWith('/heartbeat')) {
          heartbeatCalls.push({ url: u, init });
          return mkOkResponse({ ok: true });
        }
        throw new Error(`Unexpected URL ${u}`);
      }
    );

    let intervalCb: (() => void) | null = null;
    const setIntervalImpl = vi.fn((cb: () => void) => {
      intervalCb = cb;
      return 42 as unknown as ReturnType<typeof setInterval>;
    });

    const client = new AgentClient({
      hubUrl: 'https://hub.example.com',
      pairingToken: 'pair-token',
      nodeId: 'node-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ensureBinaryImpl: vi.fn(async () => ({
        frps: '/tmp/cache/frps',
        frpc: '/tmp/cache/frpc',
      })),
      startFrpcImpl: vi.fn(() => makeFakeFrpHandle()),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      ptyBridgeFactory: () => makeFakeBridge() as unknown as AgentPtyBridge,
      setIntervalImpl: setIntervalImpl as unknown as typeof setInterval,
      clearIntervalImpl: vi.fn() as unknown as typeof clearInterval,
    });

    await client.start();
    expect(intervalCb).toBeTypeOf('function');
    // Trigger the heartbeat
    await intervalCb!();

    expect(heartbeatCalls.length).toBeGreaterThanOrEqual(1);
    const call = heartbeatCalls[0];
    expect(call.url).toBe('https://hub.example.com/api/fleet/nodes/node-1/heartbeat');
    const hdrs = call.init?.headers as Record<string, string>;
    expect(hdrs.Authorization).toBe('Bearer pair-token');
    expect(hdrs['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(call.init?.body));
    expect(body.nodeId).toBe('node-1');
    expect(body.tunnel).toBeDefined();
    expect(body.capabilities).toBeDefined();
    await client.stop();
  });
});
