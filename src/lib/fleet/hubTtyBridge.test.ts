import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  HubTtyBridge,
  type AgentEndpoint,
  type HubWsAdapter,
  type HubWsFactory,
} from './hubTtyBridge';
import { TTY_MSG } from './tty-bridge';

interface FakeWs extends EventEmitter {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: 0 | 1 | 2 | 3;
}

function makeFakeWs(initialState: 0 | 1 = 0): FakeWs {
  const ws = new EventEmitter() as FakeWs;
  ws.readyState = initialState;
  ws.send = vi.fn();
  ws.close = vi.fn(() => {
    ws.readyState = 3;
  });
  return ws;
}

function makeFactory(wsOrFn: FakeWs | (() => FakeWs)): HubWsFactory & {
  calls: Array<{ url: string; protocols?: string[]; headers?: Record<string, string> }>;
} {
  const calls: Array<{
    url: string;
    protocols?: string[];
    headers?: Record<string, string>;
  }> = [];
  const fn: HubWsFactory = (url, protocols, headers): HubWsAdapter => {
    calls.push({ url, protocols, headers });
    const ws = typeof wsOrFn === 'function' ? wsOrFn() : wsOrFn;
    return ws as unknown as HubWsAdapter;
  };
  return Object.assign(fn, { calls });
}

const endpoint: AgentEndpoint = {
  host: '127.0.0.1',
  port: 7001,
  authToken: 'agent-token',
};

describe('HubTtyBridge.openSession', () => {
  it('rejects with agent-unreachable when resolveAgentEndpoint returns null', async () => {
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => null,
    });
    await expect(
      bridge.openSession({ nodeId: 'n', sessionId: 's', cols: 80, rows: 24 })
    ).rejects.toThrow('agent-unreachable');
  });

  it('builds ws url, passes Authorization header, and sends open frame', async () => {
    const ws = makeFakeWs(0);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
      openTimeoutMs: 1000,
    });

    const promise = bridge.openSession({
      nodeId: 'n-1',
      sessionId: 'sess-1',
      cols: 100,
      rows: 30,
      shell: '/bin/bash',
      cwd: '/tmp',
    });
    // emit open event so waitForOpen resolves
    setImmediate(() => {
      ws.readyState = 1;
      ws.emit('open');
    });
    const session = await promise;

    expect(factory.calls).toHaveLength(1);
    expect(factory.calls[0].url).toBe('ws://127.0.0.1:7001/tty');
    expect(factory.calls[0].headers).toEqual({ Authorization: 'Bearer agent-token' });

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(sent).toEqual({
      type: TTY_MSG.OPEN,
      payload: {
        nodeId: 'n-1',
        sessionId: 'sess-1',
        cols: 100,
        rows: 30,
        shell: '/bin/bash',
        cwd: '/tmp',
      },
    });
    expect(session.sessionId).toBe('sess-1');
    expect(session.nodeId).toBe('n-1');
  });

  it('skips open wait if ws is already OPEN', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    expect(session.sessionId).toBe('s');
    expect(ws.send).toHaveBeenCalledOnce();
  });

  it('rejects with hub-tty-open-timeout when open event never arrives', async () => {
    const ws = makeFakeWs(0);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
      openTimeoutMs: 10,
    });
    await expect(
      bridge.openSession({ nodeId: 'n', sessionId: 's', cols: 80, rows: 24 })
    ).rejects.toThrow('hub-tty-open-timeout');
    expect(ws.close).toHaveBeenCalled();
  });

  it('rejects if ws emits error before open', async () => {
    const ws = makeFakeWs(0);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
      openTimeoutMs: 1000,
    });
    const p = bridge.openSession({ nodeId: 'n', sessionId: 's', cols: 80, rows: 24 });
    setImmediate(() => ws.emit('error', new Error('connection refused')));
    await expect(p).rejects.toThrow(/hub-tty-open-failed: connection refused/);
  });

  it('session.send emits a DATA frame', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    session.send('ls\r\n');
    const calls = (ws.send as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      JSON.parse(c[0] as string)
    );
    expect(calls[1]).toEqual({
      type: TTY_MSG.DATA,
      payload: { sessionId: 's', data: 'ls\r\n' },
    });
  });

  it('session.resize emits a RESIZE frame', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    session.resize(120, 40);
    const calls = (ws.send as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      JSON.parse(c[0] as string)
    );
    expect(calls[1]).toEqual({
      type: TTY_MSG.RESIZE,
      payload: { sessionId: 's', cols: 120, rows: 40 },
    });
  });

  it('session.close emits a CLOSE frame and calls ws.close', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    session.close();
    const calls = (ws.send as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      JSON.parse(c[0] as string)
    );
    expect(calls[1]).toEqual({ type: TTY_MSG.CLOSE, payload: { sessionId: 's' } });
    expect(ws.close).toHaveBeenCalled();
  });

  it('onData callback fires for DATA frames matching sessionId', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    const chunks: string[] = [];
    session.onData((c) => chunks.push(c));
    ws.emit(
      'message',
      JSON.stringify({
        type: TTY_MSG.DATA,
        payload: { sessionId: 's', data: 'hello' },
      })
    );
    ws.emit(
      'message',
      JSON.stringify({
        type: TTY_MSG.DATA,
        payload: { sessionId: 'other', data: 'ignored' },
      })
    );
    expect(chunks).toEqual(['hello']);
  });

  it('onData accepts Buffer frames', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    const chunks: string[] = [];
    session.onData((c) => chunks.push(c));
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({ type: TTY_MSG.DATA, payload: { sessionId: 's', data: 'buf' } }),
        'utf8'
      )
    );
    expect(chunks).toEqual(['buf']);
  });

  it('onExit fires for EXIT frames with exitCode/signal', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    const exits: Array<{ exitCode: number | null; signal: string | null }> = [];
    session.onExit((info) => exits.push(info));
    ws.emit(
      'message',
      JSON.stringify({
        type: TTY_MSG.EXIT,
        payload: { sessionId: 's', exitCode: 0, signal: null },
      })
    );
    expect(exits).toEqual([{ exitCode: 0, signal: null }]);
  });

  it('onReady fires for READY frames', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    const readyCalls: number[] = [];
    session.onReady(() => readyCalls.push(Date.now()));
    ws.emit('message', JSON.stringify({ type: TTY_MSG.READY, payload: { sessionId: 's' } }));
    expect(readyCalls).toHaveLength(1);
  });

  it('onError fires for ERROR frames and ws error events', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    const errs: string[] = [];
    session.onError((m) => errs.push(m));
    ws.emit(
      'message',
      JSON.stringify({
        type: TTY_MSG.ERROR,
        payload: { sessionId: 's', message: 'spawn failed' },
      })
    );
    ws.emit('error', new Error('socket blew up'));
    expect(errs).toEqual(['spawn failed', 'socket blew up']);
  });

  it('ws close event triggers exit callbacks with null exitCode/signal', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    const exits: Array<{ exitCode: number | null; signal: string | null }> = [];
    session.onExit((info) => exits.push(info));
    ws.emit('close');
    expect(exits).toEqual([{ exitCode: null, signal: null }]);
  });

  it('ignores malformed JSON frames without throwing', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const logs: Array<{ level: string; eventType: string }> = [];
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
      logEntry: (e) => logs.push({ level: e.level, eventType: e.eventType }),
    });
    const session = await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    const chunks: string[] = [];
    session.onData((c) => chunks.push(c));
    ws.emit('message', 'not-json');
    expect(chunks).toEqual([]);
  });

  it('logs a warning on frames that pass JSON but fail Zod', async () => {
    const ws = makeFakeWs(1);
    const factory = makeFactory(ws);
    const logs: Array<{ level: string; eventType: string }> = [];
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
      wsFactory: factory,
      logEntry: (e) => logs.push({ level: e.level, eventType: e.eventType }),
    });
    await bridge.openSession({
      nodeId: 'n',
      sessionId: 's',
      cols: 80,
      rows: 24,
    });
    ws.emit('message', JSON.stringify({ type: TTY_MSG.DATA, payload: { sessionId: 's' } }));
    expect(logs.find((l) => l.eventType === 'hub.tty.invalid_frame')).toBeTruthy();
  });

  it('throws if wsFactory is not configured', async () => {
    const bridge = new HubTtyBridge({
      resolveAgentEndpoint: async () => endpoint,
    });
    await expect(
      bridge.openSession({ nodeId: 'n', sessionId: 's', cols: 80, rows: 24 })
    ).rejects.toThrow('wsFactory-not-configured');
  });
});
