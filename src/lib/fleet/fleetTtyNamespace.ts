import type { Server as SocketIOServer } from 'socket.io';
import { HubTtyBridge, type HubTtySession } from './hubTtyBridge';
import { TTY_MSG, parseTtyMessage } from './tty-bridge';
import { hasCapability, mapRole } from './rbac';
import type { ResourceGuardCheckInput, ResourceGuardCheckResult } from './resourceGuardMiddleware';

export const FLEET_TTY_NAMESPACE_PATH = '/api/fleet/tty';

export interface FleetTtySessionUser {
  userId: string;
  role: string;
}

export interface FleetTtyNamespaceLogEntry {
  level: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterFleetTtyNamespaceOpts {
  io: SocketIOServer;
  bridge: HubTtyBridge;
  verifySession?: (cookieHeader: string | undefined) => Promise<FleetTtySessionUser | null>;
  logEntry?: (e: FleetTtyNamespaceLogEntry) => void;
  enforceResourceGuardImpl?: (input: ResourceGuardCheckInput) => Promise<ResourceGuardCheckResult>;
}

export function registerFleetTtyNamespace(opts: RegisterFleetTtyNamespaceOpts): void {
  const { io, bridge, verifySession, logEntry, enforceResourceGuardImpl } = opts;
  const nsp = io.of(FLEET_TTY_NAMESPACE_PATH);

  const log = (
    level: string,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void => {
    if (!logEntry) return;
    try {
      logEntry({ level, eventType, message, metadata });
    } catch {
      // swallow
    }
  };

  nsp.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake?.headers?.cookie;
      if (!verifySession) {
        log('warn', 'hub.tty.auth_misconfigured', 'verifySession not configured');
        return next(new Error('Authentication not configured'));
      }
      const user = await verifySession(cookieHeader);
      if (!user) {
        log('warn', 'hub.tty.auth_rejected', 'fleet tty socket auth rejected');
        return next(new Error('Authentication required'));
      }
      if (!hasCapability(mapRole(user.role), 'can_terminal')) {
        log('warn', 'hub.tty.auth_forbidden', 'fleet tty socket forbidden by rbac', {
          userId: user.userId,
          role: user.role,
        });
        return next(new Error('Forbidden'));
      }
      (socket as unknown as { user: FleetTtySessionUser }).user = user;
      next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('error', 'hub.tty.auth_error', 'fleet tty auth middleware failed', { error: msg });
      next(new Error('Authentication error'));
    }
  });

  nsp.on('connection', (socket) => {
    const sessions = new Map<string, HubTtySession>();
    const user = (socket as unknown as { user?: FleetTtySessionUser }).user;
    log('info', 'hub.tty.connected', 'fleet tty socket connected', {
      socketId: socket.id,
      userId: user?.userId,
    });

    const closeAll = (): void => {
      for (const [sessionId, session] of sessions.entries()) {
        try {
          session.close();
        } catch {
          // swallow
        }
        sessions.delete(sessionId);
      }
    };

    socket.on(TTY_MSG.OPEN, async (payload: unknown) => {
      let parsed;
      try {
        parsed = parseTtyMessage(TTY_MSG.OPEN, payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        socket.emit(TTY_MSG.ERROR, { sessionId: '', message });
        log('warn', 'hub.tty.open_invalid', 'tty open rejected by zod', { error: message });
        return;
      }
      if (parsed.type !== 'OPEN') return;

      const { nodeId, sessionId, cols, rows, shell, cwd } = parsed.data;
      if (sessions.has(sessionId)) {
        socket.emit(TTY_MSG.ERROR, {
          sessionId,
          message: 'session-already-open',
        });
        return;
      }

      if (enforceResourceGuardImpl) {
        try {
          const guard = await enforceResourceGuardImpl({
            key: 'maxActiveTerminals',
            scope: 'global',
            currentCounter: async () => sessions.size + 1,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ResourcePolicy: {} as any,
            actorUserId: user?.userId,
          });
          if (!guard.allowed) {
            socket.emit(TTY_MSG.ERROR, {
              sessionId,
              message: `terminal-limit-exceeded: ${guard.message}`,
            });
            log('warn', 'hub.tty.open_limit_exceeded', 'tty open rejected by resource guard', {
              nodeId,
              sessionId,
              userId: user?.userId,
              limit: guard.limit,
              current: guard.current,
            });
            return;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log('error', 'hub.tty.open_limit_check_failed', 'resource guard check failed', {
            error: message,
          });
        }
      }

      try {
        const session = await bridge.openSession({ nodeId, sessionId, cols, rows, shell, cwd });
        sessions.set(sessionId, session);
        session.onData((chunk) => {
          socket.emit(TTY_MSG.DATA, { sessionId, data: chunk });
        });
        session.onExit((info) => {
          socket.emit(TTY_MSG.EXIT, {
            sessionId,
            exitCode: info.exitCode,
            signal: info.signal,
          });
          sessions.delete(sessionId);
        });
        session.onError((m) => {
          socket.emit(TTY_MSG.ERROR, { sessionId, message: m });
        });
        session.onReady(() => {
          socket.emit(TTY_MSG.READY, { sessionId });
        });
        log('info', 'hub.tty.open', 'tty session opened', {
          nodeId,
          sessionId,
          userId: user?.userId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        socket.emit(TTY_MSG.ERROR, { sessionId, message });
        log('error', 'hub.tty.open_failed', 'tty session open failed', {
          nodeId,
          sessionId,
          error: message,
        });
      }
    });

    socket.on(TTY_MSG.DATA, (payload: unknown) => {
      let parsed;
      try {
        parsed = parseTtyMessage(TTY_MSG.DATA, payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        socket.emit(TTY_MSG.ERROR, { sessionId: '', message });
        return;
      }
      if (parsed.type !== 'DATA') return;
      const session = sessions.get(parsed.data.sessionId);
      if (!session) {
        socket.emit(TTY_MSG.ERROR, {
          sessionId: parsed.data.sessionId,
          message: 'no-such-session',
        });
        return;
      }
      try {
        session.send(parsed.data.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        socket.emit(TTY_MSG.ERROR, { sessionId: parsed.data.sessionId, message });
      }
    });

    socket.on(TTY_MSG.RESIZE, (payload: unknown) => {
      let parsed;
      try {
        parsed = parseTtyMessage(TTY_MSG.RESIZE, payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        socket.emit(TTY_MSG.ERROR, { sessionId: '', message });
        return;
      }
      if (parsed.type !== 'RESIZE') return;
      const session = sessions.get(parsed.data.sessionId);
      if (!session) return;
      try {
        session.resize(parsed.data.cols, parsed.data.rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        socket.emit(TTY_MSG.ERROR, { sessionId: parsed.data.sessionId, message });
      }
    });

    socket.on(TTY_MSG.CLOSE, (payload: unknown) => {
      let parsed;
      try {
        parsed = parseTtyMessage(TTY_MSG.CLOSE, payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        socket.emit(TTY_MSG.ERROR, { sessionId: '', message });
        return;
      }
      if (parsed.type !== 'CLOSE') return;
      const session = sessions.get(parsed.data.sessionId);
      if (!session) return;
      try {
        session.close();
      } catch {
        // swallow
      }
      sessions.delete(parsed.data.sessionId);
      log('info', 'hub.tty.close', 'tty session closed', {
        sessionId: parsed.data.sessionId,
        userId: user?.userId,
      });
    });

    socket.on('disconnect', () => {
      closeAll();
      log('info', 'hub.tty.disconnected', 'fleet tty socket disconnected', {
        socketId: socket.id,
        userId: user?.userId,
      });
    });
  });
}
