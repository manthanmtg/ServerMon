import { EventEmitter } from 'node:events';
import os from 'node:os';
import type * as Pty from 'node-pty';
import { parseTtyMessage, TTY_MSG } from './tty-bridge';

export interface AgentPtyBridgeLogEntry {
  level: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AgentWsServer extends EventEmitter {
  close(cb?: () => void): void;
}

export interface AgentWsSocket extends EventEmitter {
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
}

export interface AgentConnectionRequest {
  headers?: Record<string, string | string[] | undefined>;
}

export interface AgentPtyBridgeOpts {
  port: number;
  authToken: string;
  wsServerFactory?: (port: number) => AgentWsServer;
  ptySpawn?: typeof Pty.spawn;
  logEntry?: (e: AgentPtyBridgeLogEntry) => void;
  defaultShell?: string;
  now?: () => Date;
}

interface SessionEntry {
  pty: Pty.IPty;
}

function readAuthHeader(req: AgentConnectionRequest | undefined): string | undefined {
  const headers = req?.headers;
  if (!headers) return undefined;
  const raw =
    headers.authorization ??
    headers.Authorization ??
    (headers['authorization'] as string | string[] | undefined);
  if (Array.isArray(raw)) return raw[0];
  return raw ?? undefined;
}

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1] : undefined;
}

function defaultShell(override?: string): string {
  if (override) return override;
  if (os.platform() === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/sh';
}

async function defaultWsServerFactory(port: number): Promise<AgentWsServer> {
  const { WebSocketServer } = await import('ws');
  return new WebSocketServer({ port }) as unknown as AgentWsServer;
}

export class AgentPtyBridge {
  private readonly opts: AgentPtyBridgeOpts;
  private server: AgentWsServer | null = null;
  private readonly bySocket = new Map<AgentWsSocket, Map<string, SessionEntry>>();
  private running = false;

  constructor(opts: AgentPtyBridgeOpts) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (this.running) return;
    const factory = this.opts.wsServerFactory;
    this.server = factory ? factory(this.opts.port) : await defaultWsServerFactory(this.opts.port);
    this.running = true;
    this.server.on('connection', (socket: AgentWsSocket, req?: AgentConnectionRequest) => {
      this.handleConnection(socket, req);
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    for (const [socket, sessions] of this.bySocket.entries()) {
      for (const entry of sessions.values()) {
        try {
          entry.pty.kill();
        } catch {
          // swallow
        }
      }
      this.bySocket.delete(socket);
    }
    const srv = this.server;
    await new Promise<void>((resolve) => {
      if (!srv) {
        resolve();
        return;
      }
      try {
        srv.close(() => resolve());
      } catch {
        resolve();
      }
    });
    this.server = null;
    this.running = false;
  }

  status(): { running: boolean; sessionCount: number } {
    let sessionCount = 0;
    for (const sessions of this.bySocket.values()) {
      sessionCount += sessions.size;
    }
    return { running: this.running, sessionCount };
  }

  private handleConnection(socket: AgentWsSocket, req?: AgentConnectionRequest): void {
    const header = readAuthHeader(req);
    const token = extractBearer(header);
    if (!token || token !== this.opts.authToken) {
      this.log('warn', 'agent.tty.auth_rejected', 'agent tty auth rejected');
      try {
        socket.close(4401, 'unauthorized');
      } catch {
        // swallow
      }
      return;
    }

    const sessions = new Map<string, SessionEntry>();
    this.bySocket.set(socket, sessions);
    this.log('info', 'agent.tty.connected', 'agent tty socket connected');

    socket.on('message', (raw: unknown) => {
      const frame = parseFrame(raw);
      if (!frame) return;
      try {
        this.dispatch(socket, sessions, frame);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log('warn', 'agent.tty.dispatch_error', 'failed to dispatch frame', {
          error: message,
          type: frame.type,
        });
      }
    });

    const cleanup = (): void => {
      const s = this.bySocket.get(socket);
      if (!s) return;
      for (const entry of s.values()) {
        try {
          entry.pty.kill();
        } catch {
          // swallow
        }
      }
      this.bySocket.delete(socket);
      this.log('info', 'agent.tty.disconnected', 'agent tty socket disconnected');
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  }

  private dispatch(
    socket: AgentWsSocket,
    sessions: Map<string, SessionEntry>,
    frame: { type: string; payload: unknown }
  ): void {
    let parsed;
    try {
      parsed = parseTtyMessage(frame.type, frame.payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log('warn', 'agent.tty.invalid_frame', 'invalid frame', {
        error: message,
        type: frame.type,
      });
      return;
    }

    if (parsed.type === 'OPEN') {
      this.handleOpen(socket, sessions, parsed.data);
    } else if (parsed.type === 'DATA') {
      const entry = sessions.get(parsed.data.sessionId);
      if (entry) entry.pty.write(parsed.data.data);
    } else if (parsed.type === 'RESIZE') {
      const entry = sessions.get(parsed.data.sessionId);
      if (entry) entry.pty.resize(parsed.data.cols, parsed.data.rows);
    } else if (parsed.type === 'CLOSE') {
      const entry = sessions.get(parsed.data.sessionId);
      if (entry) {
        try {
          entry.pty.kill();
        } catch {
          // swallow
        }
        sessions.delete(parsed.data.sessionId);
      }
    }
  }

  private handleOpen(
    socket: AgentWsSocket,
    sessions: Map<string, SessionEntry>,
    data: { sessionId: string; cols: number; rows: number; shell?: string; cwd?: string }
  ): void {
    if (sessions.has(data.sessionId)) {
      sendFrame(socket, {
        type: TTY_MSG.ERROR,
        payload: { sessionId: data.sessionId, message: 'session-already-open' },
      });
      return;
    }
    const spawn = this.opts.ptySpawn;
    if (!spawn) {
      sendFrame(socket, {
        type: TTY_MSG.ERROR,
        payload: { sessionId: data.sessionId, message: 'pty-unavailable' },
      });
      return;
    }

    const shell = defaultShell(data.shell ?? this.opts.defaultShell);
    let ptyProc: Pty.IPty;
    try {
      ptyProc = spawn(shell, [], {
        name: 'xterm-color',
        cols: data.cols,
        rows: data.rows,
        cwd: data.cwd ?? process.cwd(),
        env: process.env as Record<string, string>,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendFrame(socket, {
        type: TTY_MSG.ERROR,
        payload: { sessionId: data.sessionId, message },
      });
      return;
    }

    sessions.set(data.sessionId, { pty: ptyProc });

    ptyProc.onData((chunk) => {
      sendFrame(socket, {
        type: TTY_MSG.DATA,
        payload: { sessionId: data.sessionId, data: chunk },
      });
    });
    ptyProc.onExit(({ exitCode, signal }) => {
      sendFrame(socket, {
        type: TTY_MSG.EXIT,
        payload: {
          sessionId: data.sessionId,
          exitCode: exitCode ?? null,
          signal: signal != null ? String(signal) : null,
        },
      });
      sessions.delete(data.sessionId);
    });

    sendFrame(socket, {
      type: TTY_MSG.READY,
      payload: { sessionId: data.sessionId },
    });
    this.log('info', 'agent.tty.open', 'agent tty session opened', {
      sessionId: data.sessionId,
    });
  }

  private log(
    level: string,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.opts.logEntry) return;
    try {
      this.opts.logEntry({ level, eventType, message, metadata });
    } catch {
      // swallow
    }
  }
}

function parseFrame(raw: unknown): { type: string; payload: unknown } | null {
  let text: string;
  if (typeof raw === 'string') {
    text = raw;
  } else if (raw instanceof Buffer) {
    text = raw.toString('utf8');
  } else if (raw && typeof raw === 'object' && 'toString' in (raw as object)) {
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

function sendFrame(socket: AgentWsSocket, frame: { type: string; payload: unknown }): void {
  try {
    socket.send(JSON.stringify(frame));
  } catch {
    // swallow
  }
}
