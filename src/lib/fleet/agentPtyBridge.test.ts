import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AgentPtyBridge, type AgentWsServer } from './agentPtyBridge';
import { TTY_MSG } from './tty-bridge';

interface FakePty extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: (cb: (data: string) => void) => { dispose: () => void };
  onExit: (cb: (e: { exitCode: number; signal?: number | null }) => void) => {
    dispose: () => void;
  };
  _emitData: (data: string) => void;
  _emitExit: (exitCode: number, signal?: number | null) => void;
  killed: boolean;
}

function makeFakePty(): FakePty {
  const pty = new EventEmitter() as FakePty;
  const dataCbs: Array<(data: string) => void> = [];
  const exitCbs: Array<(e: { exitCode: number; signal?: number | null }) => void> = [];
  pty.write = vi.fn();
  pty.resize = vi.fn();
  pty.killed = false;
  pty.kill = vi.fn(() => {
    pty.killed = true;
  });
  pty.onData = (cb): { dispose: () => void } => {
    dataCbs.push(cb);
    return { dispose: (): void => {} };
  };
  pty.onExit = (cb): { dispose: () => void } => {
    exitCbs.push(cb);
    return { dispose: (): void => {} };
  };
  pty._emitData = (data): void => {
    for (const cb of dataCbs) cb(data);
  };
  pty._emitExit = (exitCode, signal = null): void => {
    for (const cb of exitCbs) cb({ exitCode, signal });
  };
  return pty;
}

interface FakeSocket extends EventEmitter {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  _closeCode?: number;
}

function makeFakeSocket(): FakeSocket {
  const ws = new EventEmitter() as FakeSocket;
  ws.send = vi.fn();
  ws.close = vi.fn((code?: number) => {
    ws._closeCode = code;
  });
  return ws;
}

interface FakeServer extends EventEmitter {
  close: (cb?: () => void) => void;
  _closed: boolean;
}

function makeFakeServer(): FakeServer {
  const srv = new EventEmitter() as FakeServer;
  srv._closed = false;
  srv.close = (cb?: () => void): void => {
    srv._closed = true;
    if (cb) cb();
  };
  return srv;
}

function openFrame(sessionId: string): { type: string; payload: unknown } {
  return {
    type: TTY_MSG.OPEN,
    payload: { nodeId: 'n', sessionId, cols: 80, rows: 24 },
  };
}

function send(socket: FakeSocket, frame: { type: string; payload: unknown }): void {
  socket.emit('message', JSON.stringify(frame));
}

function makeConnectionReq(authHeader?: string): { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return { headers };
}

describe('AgentPtyBridge', () => {
  it('start() creates a WebSocketServer on the configured port', async () => {
    const server = makeFakeServer();
    const wsServerFactory = vi.fn((_port: number) => server as unknown as AgentWsServer);
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory,
      ptySpawn: vi.fn() as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();
    expect(wsServerFactory).toHaveBeenCalledWith(8001);
    expect(bridge.status().running).toBe(true);
    await bridge.stop();
  });

  it('rejects connection when Authorization header is missing', async () => {
    const server = makeFakeServer();
    const ptySpawn = vi.fn();
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: ptySpawn as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();

    const socket = makeFakeSocket();
    server.emit('connection', socket, makeConnectionReq(undefined));
    expect(socket.close).toHaveBeenCalled();
    expect((socket.close as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(4401);
    expect(ptySpawn).not.toHaveBeenCalled();
    await bridge.stop();
  });

  it('rejects connection when Authorization token is wrong', async () => {
    const server = makeFakeServer();
    const ptySpawn = vi.fn();
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: ptySpawn as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();

    const socket = makeFakeSocket();
    server.emit('connection', socket, makeConnectionReq('Bearer wrong'));
    expect(socket.close).toHaveBeenCalled();
    expect((socket.close as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(4401);
    expect(ptySpawn).not.toHaveBeenCalled();
    await bridge.stop();
  });

  it('accepts connection with valid Authorization header', async () => {
    const server = makeFakeServer();
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: vi.fn(() => makeFakePty()) as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();

    const socket = makeFakeSocket();
    server.emit('connection', socket, makeConnectionReq('Bearer tok'));
    expect(socket.close).not.toHaveBeenCalled();
    await bridge.stop();
  });

  it('OPEN spawns pty and emits tty:ready; DATA writes to pty; pty data flows back as tty:data', async () => {
    const server = makeFakeServer();
    const pty = makeFakePty();
    const ptySpawn = vi.fn(() => pty);
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      defaultShell: '/bin/bash',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: ptySpawn as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();

    const socket = makeFakeSocket();
    server.emit('connection', socket, makeConnectionReq('Bearer tok'));

    send(socket, openFrame('s-1'));
    expect(ptySpawn).toHaveBeenCalledTimes(1);
    const spawnCall = ptySpawn.mock.calls[0] as unknown as [
      string,
      string[],
      { cols: number; rows: number; cwd?: string },
    ];
    expect(spawnCall[0]).toBe('/bin/bash');
    expect(spawnCall[1]).toEqual([]);
    expect(spawnCall[2].cols).toBe(80);
    expect(spawnCall[2].rows).toBe(24);

    // tty:ready sent
    const readyCall = (socket.send as ReturnType<typeof vi.fn>).mock.calls.find((c: unknown[]) => {
      const parsed = JSON.parse(c[0] as string) as { type: string };
      return parsed.type === TTY_MSG.READY;
    });
    expect(readyCall).toBeDefined();

    expect(bridge.status().sessionCount).toBe(1);

    // Data from pty → tty:data
    pty._emitData('hello');
    const dataCall = (socket.send as ReturnType<typeof vi.fn>).mock.calls.find((c: unknown[]) => {
      const parsed = JSON.parse(c[0] as string) as { type: string };
      return parsed.type === TTY_MSG.DATA;
    });
    expect(dataCall).toBeDefined();
    const dataFrame = JSON.parse(dataCall![0] as string) as {
      type: string;
      payload: { sessionId: string; data: string };
    };
    expect(dataFrame.payload).toEqual({ sessionId: 's-1', data: 'hello' });

    // DATA from socket → pty.write
    send(socket, {
      type: TTY_MSG.DATA,
      payload: { sessionId: 's-1', data: 'ls\n' },
    });
    expect(pty.write).toHaveBeenCalledWith('ls\n');

    await bridge.stop();
  });

  it('RESIZE calls pty.resize', async () => {
    const server = makeFakeServer();
    const pty = makeFakePty();
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: vi.fn(() => pty) as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();

    const socket = makeFakeSocket();
    server.emit('connection', socket, makeConnectionReq('Bearer tok'));
    send(socket, openFrame('s-1'));

    send(socket, {
      type: TTY_MSG.RESIZE,
      payload: { sessionId: 's-1', cols: 120, rows: 40 },
    });
    expect(pty.resize).toHaveBeenCalledWith(120, 40);

    await bridge.stop();
  });

  it('CLOSE kills the pty and removes the session', async () => {
    const server = makeFakeServer();
    const pty = makeFakePty();
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: vi.fn(() => pty) as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();

    const socket = makeFakeSocket();
    server.emit('connection', socket, makeConnectionReq('Bearer tok'));
    send(socket, openFrame('s-1'));
    expect(bridge.status().sessionCount).toBe(1);

    send(socket, { type: TTY_MSG.CLOSE, payload: { sessionId: 's-1' } });
    expect(pty.kill).toHaveBeenCalled();
    expect(bridge.status().sessionCount).toBe(0);

    await bridge.stop();
  });

  it('pty exit sends tty:exit and removes session', async () => {
    const server = makeFakeServer();
    const pty = makeFakePty();
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: vi.fn(() => pty) as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();

    const socket = makeFakeSocket();
    server.emit('connection', socket, makeConnectionReq('Bearer tok'));
    send(socket, openFrame('s-1'));

    pty._emitExit(0);
    const exitCall = (socket.send as ReturnType<typeof vi.fn>).mock.calls.find((c: unknown[]) => {
      const parsed = JSON.parse(c[0] as string) as { type: string };
      return parsed.type === TTY_MSG.EXIT;
    });
    expect(exitCall).toBeDefined();
    expect(bridge.status().sessionCount).toBe(0);

    await bridge.stop();
  });

  it('disconnect kills all ptys for that socket', async () => {
    const server = makeFakeServer();
    const pty1 = makeFakePty();
    const pty2 = makeFakePty();
    const ptys = [pty1, pty2];
    let spawnCount = 0;
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: vi.fn(() => {
        return ptys[spawnCount++];
      }) as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();

    const socket = makeFakeSocket();
    server.emit('connection', socket, makeConnectionReq('Bearer tok'));
    send(socket, openFrame('s-1'));
    send(socket, openFrame('s-2'));
    expect(bridge.status().sessionCount).toBe(2);

    socket.emit('close');
    expect(pty1.kill).toHaveBeenCalled();
    expect(pty2.kill).toHaveBeenCalled();
    expect(bridge.status().sessionCount).toBe(0);

    await bridge.stop();
  });

  it('stop() closes the websocket server', async () => {
    const server = makeFakeServer();
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: vi.fn() as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();
    await bridge.stop();
    expect(server._closed).toBe(true);
    expect(bridge.status().running).toBe(false);
  });

  it('invalid/malformed frames do not crash the bridge', async () => {
    const server = makeFakeServer();
    const bridge = new AgentPtyBridge({
      port: 8001,
      authToken: 'tok',
      wsServerFactory: () => server as unknown as AgentWsServer,
      ptySpawn: vi.fn(() => makeFakePty()) as unknown as typeof import('node-pty').spawn,
    });
    await bridge.start();

    const socket = makeFakeSocket();
    server.emit('connection', socket, makeConnectionReq('Bearer tok'));
    socket.emit('message', 'not-json');
    socket.emit('message', JSON.stringify({ type: 'unknown:type', payload: {} }));
    expect(bridge.status().sessionCount).toBe(0);

    await bridge.stop();
  });
});
