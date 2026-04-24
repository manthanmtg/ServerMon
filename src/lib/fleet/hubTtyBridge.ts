import { EventEmitter } from 'node:events';
import { TTY_MSG, parseTtyMessage, type TtyOpen } from './tty-bridge';

export interface AgentEndpoint {
  host: string;
  port: number;
  authToken: string;
}

export type HubWsReadyState = 0 | 1 | 2 | 3;

export interface HubWsAdapter extends EventEmitter {
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  readonly readyState: HubWsReadyState;
}

export type HubWsFactory = (
  url: string,
  protocols?: string[],
  headers?: Record<string, string>
) => HubWsAdapter;

export interface HubTtyBridgeLogEntry {
  level: string;
  eventType: string;
  message: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface HubTtyBridgeDeps {
  resolveAgentEndpoint(nodeId: string): Promise<AgentEndpoint | null>;
  wsFactory?: HubWsFactory;
  now?: () => Date;
  logEntry?: (e: HubTtyBridgeLogEntry) => void;
  openTimeoutMs?: number;
}

export interface HubTtySessionExitInfo {
  exitCode: number | null;
  signal: string | null;
}

export interface HubTtySession {
  readonly sessionId: string;
  readonly nodeId: string;
  send(data: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
  onData(cb: (chunk: string) => void): void;
  onExit(cb: (info: HubTtySessionExitInfo) => void): void;
  onError(cb: (msg: string) => void): void;
  onReady(cb: () => void): void;
}

const DEFAULT_OPEN_TIMEOUT_MS = 5_000;

type FrameMessage = { type: string; payload: unknown };

function parseIncomingFrame(raw: unknown): FrameMessage | null {
  let text: string;
  if (typeof raw === 'string') {
    text = raw;
  } else if (raw instanceof Buffer) {
    text = raw.toString('utf8');
  } else if (raw && typeof raw === 'object' && 'toString' in (raw as object)) {
    // Permissive fallback for ArrayBuffer/Uint8Array-like inputs
    text = String(raw);
  } else {
    return null;
  }

  try {
    const obj = JSON.parse(text) as unknown;
    if (!obj || typeof obj !== 'object') return null;
    const t = (obj as { type?: unknown }).type;
    if (typeof t !== 'string') return null;
    return { type: t, payload: (obj as { payload?: unknown }).payload };
  } catch {
    return null;
  }
}

export class HubTtyBridge {
  private readonly deps: HubTtyBridgeDeps;
  private readonly openTimeoutMs: number;

  constructor(deps: HubTtyBridgeDeps) {
    this.deps = deps;
    this.openTimeoutMs = deps.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
  }

  async openSession(input: TtyOpen): Promise<HubTtySession> {
    const endpoint = await this.deps.resolveAgentEndpoint(input.nodeId);
    if (!endpoint) {
      this.log('warn', 'hub.tty.agent_unreachable', 'agent endpoint not resolvable', {
        nodeId: input.nodeId,
        metadata: { sessionId: input.sessionId },
      });
      throw new Error('agent-unreachable');
    }

    const factory = this.deps.wsFactory;
    if (!factory) {
      throw new Error('wsFactory-not-configured');
    }

    const url = `ws://${endpoint.host}:${endpoint.port}/tty`;
    const ws = factory(url, undefined, {
      Authorization: `Bearer ${endpoint.authToken}`,
    });

    await this.waitForOpen(ws, input.nodeId, input.sessionId);

    const openFrame = {
      type: TTY_MSG.OPEN,
      payload: {
        nodeId: input.nodeId,
        sessionId: input.sessionId,
        cols: input.cols,
        rows: input.rows,
        shell: input.shell,
        cwd: input.cwd,
      },
    };
    ws.send(JSON.stringify(openFrame));

    const dataCbs: Array<(chunk: string) => void> = [];
    const exitCbs: Array<(info: HubTtySessionExitInfo) => void> = [];
    const errorCbs: Array<(msg: string) => void> = [];
    const readyCbs: Array<() => void> = [];

    let closed = false;

    const onMessage = (raw: unknown): void => {
      const frame = parseIncomingFrame(raw);
      if (!frame) return;
      let parsed;
      try {
        parsed = parseTtyMessage(frame.type, frame.payload);
      } catch (err) {
        this.log('warn', 'hub.tty.invalid_frame', 'invalid frame from agent', {
          nodeId: input.nodeId,
          metadata: {
            sessionId: input.sessionId,
            type: frame.type,
            error: err instanceof Error ? err.message : String(err),
          },
        });
        return;
      }
      if (parsed.type === 'DATA' && parsed.data.sessionId === input.sessionId) {
        for (const cb of dataCbs) cb(parsed.data.data);
      } else if (parsed.type === 'EXIT' && parsed.data.sessionId === input.sessionId) {
        for (const cb of exitCbs) {
          cb({ exitCode: parsed.data.exitCode, signal: parsed.data.signal });
        }
      } else if (parsed.type === 'ERROR' && parsed.data.sessionId === input.sessionId) {
        for (const cb of errorCbs) cb(parsed.data.message);
      } else if (parsed.type === 'READY' && parsed.data.sessionId === input.sessionId) {
        for (const cb of readyCbs) cb();
      }
    };

    ws.on('message', onMessage);

    const onClose = (): void => {
      if (closed) return;
      closed = true;
      for (const cb of exitCbs) cb({ exitCode: null, signal: null });
    };
    ws.on('close', onClose);

    const onWsError = (err: unknown): void => {
      const msg = err instanceof Error ? err.message : String(err);
      for (const cb of errorCbs) cb(msg);
    };
    ws.on('error', onWsError);

    return {
      sessionId: input.sessionId,
      nodeId: input.nodeId,
      send: (data: string): void => {
        if (closed) return;
        const frame = {
          type: TTY_MSG.DATA,
          payload: { sessionId: input.sessionId, data },
        };
        ws.send(JSON.stringify(frame));
      },
      resize: (cols: number, rows: number): void => {
        if (closed) return;
        const frame = {
          type: TTY_MSG.RESIZE,
          payload: { sessionId: input.sessionId, cols, rows },
        };
        ws.send(JSON.stringify(frame));
      },
      close: (): void => {
        if (closed) return;
        closed = true;
        try {
          const frame = {
            type: TTY_MSG.CLOSE,
            payload: { sessionId: input.sessionId },
          };
          ws.send(JSON.stringify(frame));
        } catch {
          // swallow; we are closing anyway
        }
        try {
          ws.close();
        } catch {
          // swallow
        }
      },
      onData: (cb): void => {
        dataCbs.push(cb);
      },
      onExit: (cb): void => {
        exitCbs.push(cb);
      },
      onError: (cb): void => {
        errorCbs.push(cb);
      },
      onReady: (cb): void => {
        readyCbs.push(cb);
      },
    };
  }

  private waitForOpen(ws: HubWsAdapter, nodeId: string, sessionId: string): Promise<void> {
    if (ws.readyState === 1) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        clearTimeout(timer);
        ws.off('open', onOpen);
        ws.off('error', onError);
      };
      const onOpen = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = (err: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        const msg = err instanceof Error ? err.message : String(err);
        reject(new Error(`hub-tty-open-failed: ${msg}`));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        this.log('warn', 'hub.tty.open_timeout', 'agent websocket open timeout', {
          nodeId,
          metadata: { sessionId, timeoutMs: this.openTimeoutMs },
        });
        try {
          ws.close();
        } catch {
          // swallow
        }
        reject(new Error('hub-tty-open-timeout'));
      }, this.openTimeoutMs);
      ws.on('open', onOpen);
      ws.on('error', onError);
    });
  }

  private log(
    level: string,
    eventType: string,
    message: string,
    extras: { nodeId?: string; metadata?: Record<string, unknown> } = {}
  ): void {
    if (!this.deps.logEntry) return;
    try {
      this.deps.logEntry({ level, eventType, message, ...extras });
    } catch {
      // swallow logging errors
    }
  }
}
