import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Server as SocketIOServer } from 'socket.io';
import { registerFleetTtyNamespace, FLEET_TTY_NAMESPACE_PATH } from './fleetTtyNamespace';
import { TTY_MSG } from './tty-bridge';
import type { HubTtySession, HubTtySessionExitInfo, HubTtyBridge } from './hubTtyBridge';
import type { ResourceGuardCheckInput, ResourceGuardCheckResult } from './resourceGuardMiddleware';

interface FakeSocket extends EventEmitter {
  id: string;
  handshake: { headers: { cookie?: string } };
  emit: EventEmitter['emit'] & ReturnType<typeof vi.fn>;
  user?: { userId: string; role: string };
}

interface FakeNamespace extends EventEmitter {
  use: ReturnType<typeof vi.fn>;
  _middlewares: Array<(socket: FakeSocket, next: (err?: Error) => void) => void | Promise<void>>;
  _runMiddlewares: (socket: FakeSocket) => Promise<Error | null>;
  _connectSocket: (socket: FakeSocket) => Promise<Error | null>;
}

function makeFakeNamespace(): FakeNamespace {
  const nsp = new EventEmitter() as FakeNamespace;
  nsp._middlewares = [];
  nsp.use = vi.fn((mw) => {
    nsp._middlewares.push(mw);
    return nsp;
  });
  nsp._runMiddlewares = async (socket) => {
    for (const mw of nsp._middlewares) {
      const err = await new Promise<Error | null>((resolve) => {
        const maybePromise = mw(socket, (e?: Error) => resolve(e ?? null));
        if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
          (maybePromise as Promise<unknown>).catch((e: unknown) =>
            resolve(e instanceof Error ? e : new Error(String(e)))
          );
        }
      });
      if (err) return err;
    }
    return null;
  };
  nsp._connectSocket = async (socket) => {
    const err = await nsp._runMiddlewares(socket);
    if (err) return err;
    nsp.emit('connection', socket);
    return null;
  };
  return nsp;
}

function makeFakeIo(): {
  io: SocketIOServer;
  nsp: FakeNamespace;
  of: ReturnType<typeof vi.fn>;
} {
  const nsp = makeFakeNamespace();
  const of = vi.fn((path: string) => {
    if (path !== FLEET_TTY_NAMESPACE_PATH) {
      throw new Error('unexpected namespace: ' + path);
    }
    return nsp;
  });
  const io = { of } as unknown as SocketIOServer;
  return { io, nsp, of };
}

function makeFakeSocket(cookie?: string): FakeSocket {
  const socket = new EventEmitter() as FakeSocket;
  socket.id = 'sock-' + Math.random().toString(36).slice(2, 8);
  socket.handshake = { headers: { cookie } };
  const originalEmit = socket.emit.bind(socket);
  socket.emit = vi.fn((...args: unknown[]) =>
    originalEmit(...(args as [string, ...unknown[]]))
  ) as FakeSocket['emit'];
  return socket;
}

interface FakeHubSession {
  readonly sessionId: string;
  readonly nodeId: string;
  send: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onData: HubTtySession['onData'];
  onExit: HubTtySession['onExit'];
  onError: HubTtySession['onError'];
  onReady: HubTtySession['onReady'];
  fireData(chunk: string): void;
  fireExit(info: HubTtySessionExitInfo): void;
  fireError(msg: string): void;
  fireReady(): void;
}

function makeFakeSession(nodeId: string, sessionId: string): FakeHubSession {
  const dataCbs: Array<(c: string) => void> = [];
  const exitCbs: Array<(info: HubTtySessionExitInfo) => void> = [];
  const errorCbs: Array<(m: string) => void> = [];
  const readyCbs: Array<() => void> = [];
  return {
    sessionId,
    nodeId,
    send: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    onData: (cb) => {
      dataCbs.push(cb);
    },
    onExit: (cb) => {
      exitCbs.push(cb);
    },
    onError: (cb) => {
      errorCbs.push(cb);
    },
    onReady: (cb) => {
      readyCbs.push(cb);
    },
    fireData(chunk) {
      for (const cb of dataCbs) cb(chunk);
    },
    fireExit(info) {
      for (const cb of exitCbs) cb(info);
    },
    fireError(msg) {
      for (const cb of errorCbs) cb(msg);
    },
    fireReady() {
      for (const cb of readyCbs) cb();
    },
  };
}

function makeFakeBridge(
  sessionFactory: (nodeId: string, sessionId: string) => FakeHubSession | Promise<FakeHubSession>
): { bridge: HubTtyBridge; openSession: ReturnType<typeof vi.fn> } {
  const openSession = vi.fn(async (input: { nodeId: string; sessionId: string }) =>
    sessionFactory(input.nodeId, input.sessionId)
  );
  const bridge = { openSession } as unknown as HubTtyBridge;
  return { bridge, openSession };
}

describe('registerFleetTtyNamespace', () => {
  it('registers on the /api/fleet/tty namespace', () => {
    const { io, of } = makeFakeIo();
    const { bridge } = makeFakeBridge(() => makeFakeSession('n', 's'));
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    expect(of).toHaveBeenCalledWith(FLEET_TTY_NAMESPACE_PATH);
  });

  it('rejects connection when verifySession returns null', async () => {
    const { io, nsp } = makeFakeIo();
    const { bridge } = makeFakeBridge(() => makeFakeSession('n', 's'));
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => null,
    });
    const socket = makeFakeSocket('bad-cookie');
    const err = await nsp._connectSocket(socket);
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/Authentication required/);
  });

  it('rejects connection when verifySession is not configured', async () => {
    const { io, nsp } = makeFakeIo();
    const { bridge } = makeFakeBridge(() => makeFakeSession('n', 's'));
    registerFleetTtyNamespace({ io, bridge });
    const socket = makeFakeSocket();
    const err = await nsp._connectSocket(socket);
    expect(err?.message).toMatch(/Authentication not configured/);
  });

  it('rejects connection when user role lacks can_terminal (viewer)', async () => {
    const { io, nsp } = makeFakeIo();
    const { bridge } = makeFakeBridge(() => makeFakeSession('n', 's'));
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'user' }),
    });
    const socket = makeFakeSocket('valid');
    const err = await nsp._connectSocket(socket);
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/Forbidden/);
  });

  it('allows connection for operator role (has can_terminal)', async () => {
    const { io, nsp } = makeFakeIo();
    const { bridge } = makeFakeBridge(() => makeFakeSession('n', 's'));
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'operator' }),
    });
    const socket = makeFakeSocket('valid');
    const err = await nsp._connectSocket(socket);
    expect(err).toBeNull();
  });

  it('rejects when verifySession throws', async () => {
    const { io, nsp } = makeFakeIo();
    const { bridge } = makeFakeBridge(() => makeFakeSession('n', 's'));
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => {
        throw new Error('db down');
      },
    });
    const socket = makeFakeSocket('cookie');
    const err = await nsp._connectSocket(socket);
    expect(err?.message).toMatch(/Authentication error/);
  });

  it('forwards OPEN to bridge.openSession and wires onData -> DATA emit', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge, openSession } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, {
      nodeId: 'node-1',
      sessionId: 'sess-1',
      cols: 80,
      rows: 24,
    });
    await new Promise((r) => setImmediate(r));

    expect(openSession).toHaveBeenCalledWith({
      nodeId: 'node-1',
      sessionId: 'sess-1',
      cols: 80,
      rows: 24,
      shell: undefined,
      cwd: undefined,
    });

    // Fire a data chunk from the bridge-side session.
    session.fireData('hello');
    const emitCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls;
    const dataCall = emitCalls.find((c) => c[0] === TTY_MSG.DATA);
    expect(dataCall).toBeTruthy();
    expect(dataCall?.[1]).toEqual({ sessionId: 'sess-1', data: 'hello' });
  });

  it('forwards READY and EXIT events as socket emits', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    session.fireReady();
    session.fireExit({ exitCode: 0, signal: null });

    const emitCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls;
    expect(emitCalls).toContainEqual([TTY_MSG.READY, { sessionId: 'sess-1' }]);
    expect(emitCalls).toContainEqual([
      TTY_MSG.EXIT,
      { sessionId: 'sess-1', exitCode: 0, signal: null },
    ]);
  });

  it('rejects OPEN with invalid payload via ERROR emit', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge, openSession } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: '', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    expect(openSession).not.toHaveBeenCalled();
    const emitCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls;
    const errorCall = emitCalls.find((c) => c[0] === TTY_MSG.ERROR);
    expect(errorCall).toBeTruthy();
  });

  it('rejects duplicate OPEN for the same sessionId', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));
    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    const errorCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === TTY_MSG.ERROR
    );
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][1]).toMatchObject({
      sessionId: 'sess-1',
      message: 'session-already-open',
    });
  });

  it('emits ERROR when bridge.openSession throws', async () => {
    const { io, nsp } = makeFakeIo();
    const bridge = {
      openSession: vi.fn(async () => {
        throw new Error('agent-unreachable');
      }),
    } as unknown as HubTtyBridge;
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    const errorCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === TTY_MSG.ERROR
    );
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][1]).toMatchObject({
      sessionId: 'sess-1',
      message: 'agent-unreachable',
    });
  });

  it('routes DATA to the correct session.send()', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    socket.emit(TTY_MSG.DATA, { sessionId: 'sess-1', data: 'ls\r\n' });
    expect(session.send).toHaveBeenCalledWith('ls\r\n');
  });

  it('emits no-such-session ERROR when DATA targets unknown session', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.DATA, { sessionId: 'nope', data: 'x' });
    const errorCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === TTY_MSG.ERROR
    );
    expect(errorCalls[0][1]).toMatchObject({
      sessionId: 'nope',
      message: 'no-such-session',
    });
  });

  it('routes RESIZE to the correct session.resize()', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    socket.emit(TTY_MSG.RESIZE, { sessionId: 'sess-1', cols: 120, rows: 40 });
    expect(session.resize).toHaveBeenCalledWith(120, 40);
  });

  it('routes CLOSE to session.close() and removes from map', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    socket.emit(TTY_MSG.CLOSE, { sessionId: 'sess-1' });
    expect(session.close).toHaveBeenCalled();

    // A second CLOSE should be a no-op (session already gone)
    (session.close as ReturnType<typeof vi.fn>).mockClear();
    socket.emit(TTY_MSG.CLOSE, { sessionId: 'sess-1' });
    expect(session.close).not.toHaveBeenCalled();
  });

  it('closes all sessions on disconnect', async () => {
    const { io, nsp } = makeFakeIo();
    const sessionA = makeFakeSession('node-1', 'sess-a');
    const sessionB = makeFakeSession('node-1', 'sess-b');
    const sessions = new Map<string, FakeHubSession>([
      ['sess-a', sessionA],
      ['sess-b', sessionB],
    ]);
    const { bridge } = makeFakeBridge((_n, id) => {
      const s = sessions.get(id);
      if (!s) throw new Error('no fixture for ' + id);
      return s;
    });
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-a' });
    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-b' });
    await new Promise((r) => setImmediate(r));

    socket.emit('disconnect');
    expect(sessionA.close).toHaveBeenCalled();
    expect(sessionB.close).toHaveBeenCalled();
  });

  it('handles EXIT by removing the session so subsequent DATA yields no-such-session', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    session.fireExit({ exitCode: 0, signal: null });

    (socket.emit as ReturnType<typeof vi.fn>).mockClear();
    socket.emit(TTY_MSG.DATA, { sessionId: 'sess-1', data: 'x' });
    const errorCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === TTY_MSG.ERROR
    );
    expect(errorCalls[0][1]).toMatchObject({
      sessionId: 'sess-1',
      message: 'no-such-session',
    });
  });

  it('refuses OPEN when enforceResourceGuardImpl denies (hard limit)', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge, openSession } = makeFakeBridge(() => session);
    let capturedInput: ResourceGuardCheckInput | null = null;
    const guardImpl = vi.fn(
      async (input: ResourceGuardCheckInput): Promise<ResourceGuardCheckResult> => {
        capturedInput = input;
        return {
          allowed: false,
          enforcement: 'hard',
          message: 'maxActiveTerminals exceeded: 2 > 1 (hard)',
          limit: 1,
          current: 2,
          soft: false,
          policy: {
            limits: { maxActiveTerminals: 1 },
            enforcement: { maxActiveTerminals: 'hard' },
          },
        };
      }
    );
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
      enforceResourceGuardImpl: guardImpl,
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    expect(guardImpl).toHaveBeenCalledTimes(1);
    expect(capturedInput).not.toBeNull();
    const input = capturedInput as unknown as ResourceGuardCheckInput;
    expect(input.key).toBe('maxActiveTerminals');
    expect(input.scope).toBe('global');
    await expect(input.currentCounter()).resolves.toBe(1);

    expect(openSession).not.toHaveBeenCalled();
    const emitCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls;
    const errorCall = emitCalls.find((c) => c[0] === TTY_MSG.ERROR);
    expect(errorCall).toBeTruthy();
    expect(errorCall?.[1]).toMatchObject({
      sessionId: 'sess-1',
      message: expect.stringContaining('terminal-limit-exceeded'),
    });
  });

  it('allows OPEN when enforceResourceGuardImpl allows', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge, openSession } = makeFakeBridge(() => session);
    const guardImpl = vi.fn(
      async (_input: ResourceGuardCheckInput): Promise<ResourceGuardCheckResult> => ({
        allowed: true,
        enforcement: 'hard',
        message: 'ok',
        limit: 10,
        current: 1,
        soft: false,
        policy: {
          limits: { maxActiveTerminals: 10 },
          enforcement: { maxActiveTerminals: 'hard' },
        },
      })
    );
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
      enforceResourceGuardImpl: guardImpl,
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    expect(guardImpl).toHaveBeenCalledTimes(1);
    expect(openSession).toHaveBeenCalledTimes(1);
  });

  it('ignores invalid RESIZE payloads without throwing', async () => {
    const { io, nsp } = makeFakeIo();
    const session = makeFakeSession('node-1', 'sess-1');
    const { bridge } = makeFakeBridge(() => session);
    registerFleetTtyNamespace({
      io,
      bridge,
      verifySession: async () => ({ userId: 'u', role: 'admin' }),
    });
    const socket = makeFakeSocket('valid');
    await nsp._connectSocket(socket);

    socket.emit(TTY_MSG.OPEN, { nodeId: 'node-1', sessionId: 'sess-1' });
    await new Promise((r) => setImmediate(r));

    socket.emit(TTY_MSG.RESIZE, { sessionId: 'sess-1', cols: 5, rows: 40 });
    expect(session.resize).not.toHaveBeenCalled();
    const errorCalls = (socket.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === TTY_MSG.ERROR
    );
    expect(errorCalls.length).toBeGreaterThan(0);
  });
});
