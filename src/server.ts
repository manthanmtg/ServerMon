import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import * as pty from 'node-pty';
import os from 'os';
import { createLogger } from './lib/logger';
import { decrypt } from './lib/session-core';
import { resetAIRunnerLogSession, writeAIRunnerLogEntry } from './lib/ai-runner/logs';
import { ensureAIRunnerSupervisor } from './lib/ai-runner/processes';
import { getRuntimeDiagnostics } from './lib/runtime-diagnostics';
import { handleRequestWithDiagnostics } from './lib/server-request-diagnostics';

const log = createLogger('server');
const diagnostics = getRuntimeDiagnostics();
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT || '8912', 10);

// Database imports for settings
import connectDB from './lib/db';
import TerminalSettings from './models/TerminalSettings';
import TerminalHistory from './models/TerminalHistory';
import TerminalSession from './models/TerminalSession';

async function cleanupStaleSessions() {
  try {
    await connectDB();
    log.info('Checking for stale terminal sessions on startup...');

    // Find all sessions that were "Active" but the server just started
    // These sessions are now dead because the PTY processes are gone
    const sessions = await TerminalSession.find().lean();

    if (sessions.length > 0) {
      log.info(`Found ${sessions.length} stale sessions. Cleaning up...`);

      for (const session of sessions) {
        const history = await TerminalHistory.findOne({
          sessionId: session.sessionId,
          closedAt: { $exists: false },
        });
        if (history) {
          history.closedAt = new Date();
          history.closedBy = 'server-restart';
          await history
            .save()
            .catch((err) =>
              log.error(`Failed to save history for stale session ${session.sessionId}`, err)
            );
        }
      }

      await TerminalSession.deleteMany({});
      log.info('Stale sessions cleaned up.');
    }
  } catch (err) {
    log.error('Failed to cleanup stale sessions on startup', err);
  }
}

if (process.env.FLEET_AGENT_MODE === 'true') {
  void (async () => {
    const { AgentClient } = await import('./lib/fleet/agentClient');
    const { AgentPtyBridge } = await import('./lib/fleet/agentPtyBridge');
    const hubUrl = process.env.FLEET_AGENT_HUB_URL;
    const pairingToken = process.env.FLEET_AGENT_PAIRING_TOKEN;
    const nodeId = process.env.FLEET_AGENT_NODE_ID;
    if (!hubUrl || !pairingToken || !nodeId) {
      log.error(
        'FLEET_AGENT_MODE=true requires FLEET_AGENT_HUB_URL, FLEET_AGENT_PAIRING_TOKEN, FLEET_AGENT_NODE_ID'
      );
      process.exit(1);
    }
    const agent = new AgentClient({
      hubUrl,
      pairingToken,
      nodeId,
      // Plumb node-pty into the bridge factory so the hub can open
      // terminal sessions on the agent. Without this the bridge is
      // started but every OPEN frame returns "pty-unavailable".
      ptyBridgeFactory: (port, token) =>
        new AgentPtyBridge({
          port,
          authToken: token,
          ptySpawn: pty.spawn,
        }),
      logEntry: (entry) => {
        // Send logs to hub via a fire-and-forget fetch
        const logUrl = `${hubUrl}/api/fleet/nodes/${nodeId}/heartbeat`;
        fetch(logUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pairingToken}`,
          },
          body: JSON.stringify({
            nodeId,
            bootId: (agent as any).bootId,
            bootAt: (agent as any).bootAt?.toISOString(),
            agentVersion: '0.0.0',
            hardware: {},
            metrics: {},
            tunnel: { status: (agent.status() as any).tunnelStatus },
            logs: [{
              level: entry.level,
              eventType: entry.eventType,
              message: entry.message,
              metadata: entry.metadata,
              timestamp: new Date().toISOString()
            }]
          })
        }).catch(() => {}); // ignore log delivery errors
      }
    });
    try {
      await agent.start();
      log.info('Fleet agent started');
    } catch (err) {
      log.error('Fleet agent start failed', err);
      process.exit(1);
    }
    const shutdown = async (): Promise<void> => {
      await agent.stop().catch(() => {});
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })();
} else {
  app.prepare().then(async () => {
    const aiRunnerLogPath = await resetAIRunnerLogSession();
    await cleanupStaleSessions();
    await writeAIRunnerLogEntry({
      level: 'info',
      component: 'server',
      event: 'server.ready',
      message: 'ServerMon server finished startup and reset AI Runner logs',
      data: {
        port,
        aiRunnerLogPath,
      },
    });
    ensureAIRunnerSupervisor();
    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url!, true);
      void handleRequestWithDiagnostics({
        req,
        res,
        parsedUrl,
        handle,
        diagnostics,
        log,
      });
    });

    const io = new Server(server, {
      path: '/api/socket',
    });

    // socket.io authentication middleware
    io.use(async (socket, next) => {
      try {
        const cookieHeader = socket.handshake.headers.cookie;
        if (!cookieHeader) {
          log.warn('Socket connection rejected: No cookies present');
          return next(new Error('Authentication error: Session cookie missing'));
        }

        const sessionCookie = cookieHeader
          .split(';')
          .find((c) => c.trim().startsWith('session='))
          ?.split('=')[1];

        if (!sessionCookie) {
          log.warn('Socket connection rejected: Session cookie not found');
          return next(new Error('Authentication error: Session cookie not found'));
        }

        const session = (await decrypt(sessionCookie).catch(
          () => null
        )) as unknown as SessionPayload;
        if (!session || !session.user) {
          log.warn('Socket connection rejected: Invalid or expired session');
          return next(new Error('Authentication error: Invalid session'));
        }

        // Attach user info to socket
        (socket as unknown as { user: SessionPayload['user'] }).user = session.user;
        next();
      } catch (err) {
        log.error('Socket authentication middleware error', err);
        next(new Error('Internal authentication error'));
      }
    });

    interface SessionPayload {
      user: {
        id: string;
        username: string;
        role: string;
      };
      expires: string;
    }

    // Persistent PTY sessions
    interface ptySession {
      ptyProcess: pty.IPty;
      buffer: string[];
      lastActive: number;
      sockets: Set<string>;
      label: string;
      createdBy: string;
    }
    const ptySessions = new Map<string, ptySession>();
    const BUFFER_SIZE = 1000;

    // Cleanup idle sessions
    setInterval(async () => {
      const now = Date.now();

      // Fetch current timeout setting (default to 30 mins if not found)
      let timeoutMs = 30 * 60 * 1000;
      try {
        await connectDB();
        const settings = await TerminalSettings.findById('terminal-settings').lean();
        if (settings?.idleTimeoutMinutes) {
          timeoutMs = settings.idleTimeoutMinutes * 60 * 1000;
        }
      } catch (err) {
        log.error('Failed to fetch terminal settings for cleanup', err);
      }

      for (const [sessionId, session] of ptySessions.entries()) {
        if (session.sockets.size === 0 && now - session.lastActive > timeoutMs) {
          log.info(`Cleaning up idle terminal session: ${sessionId}`);

          try {
            await connectDB();
            const history = await TerminalHistory.findOne({
              sessionId,
              closedAt: { $exists: false },
            });
            if (history) {
              history.closedAt = new Date();
              history.closedBy = 'timeout-autokill';
              await history.save();
            }
            await TerminalSession.deleteOne({ sessionId });
          } catch (err) {
            log.error(`Failed to update history/db for timed out session ${sessionId}`, err);
          }

          session.ptyProcess.kill();
          ptySessions.delete(sessionId);
        }
      }
    }, 60000);

    io.on('connection', (socket) => {
      log.info('New socket connection: ' + socket.id);

      let activeSessionId: string | null = null;

      socket.on(
        'terminal:start',
        async (options: {
          sessionId: string;
          label?: string;
          username?: string;
          cols?: number;
          rows?: number;
          initialCommand?: string;
        }) => {
          const { sessionId, label, username } = options;
          if (!sessionId) {
            socket.emit('terminal:error', 'sessionId is required');
            return;
          }

          try {
            activeSessionId = sessionId;
            let session = ptySessions.get(sessionId);

            if (session) {
              log.info(`Re-attaching to PTY session: ${sessionId}`);
              session.sockets.add(socket.id);
              session.lastActive = Date.now();

              // Send buffer to re-synced terminal
              if (session.buffer.length > 0) {
                socket.emit('terminal:data', session.buffer.join(''));
              }

              // Resize if requested
              if (options.cols && options.rows) {
                session.ptyProcess.resize(options.cols, options.rows);
              }
              if (options.initialCommand) {
                session.ptyProcess.write(options.initialCommand);
              }
            } else {
              let shell = '';
              let args: string[] = [];

              // Fetch settings for loginAsUser
              await connectDB().catch((e) => log.error('DB Connection failed in server.ts', e));
              const settings = await TerminalSettings.findById('terminal-settings')
                .lean()
                .catch(() => null);
              const loginAsUser = settings?.loginAsUser;
              const defaultDirectory = settings?.defaultDirectory;

              if (loginAsUser && os.platform() !== 'win32') {
                shell = 'su';
                args = ['-', loginAsUser];
                log.info(`Spawning PTY for session ${sessionId} as user ${loginAsUser}`);
              } else {
                if (os.platform() === 'win32') {
                  shell = 'powershell.exe';
                } else {
                  shell = process.env.SHELL || '';

                  if (!shell) {
                    const fs = await import('fs');
                    const fallbacks = ['/bin/zsh', '/bin/bash', '/bin/sh'];
                    for (const fb of fallbacks) {
                      if (fs.existsSync(fb)) {
                        shell = fb;
                        break;
                      }
                    }
                  }

                  if (!shell) shell = 'sh';
                }
                log.info(`Spawning PTY for session ${sessionId} (shell: ${shell})`);
              }

              let cwd = process.cwd();
              if (defaultDirectory) {
                const fs = await import('fs');
                if (fs.existsSync(defaultDirectory)) {
                  cwd = defaultDirectory;
                } else {
                  log.warn(`Default directory "${defaultDirectory}" does not exist, using ${cwd}`);
                }
              }

              const ptyProcess = pty.spawn(shell, args, {
                name: 'xterm-color',
                cols: options.cols || 80,
                rows: options.rows || 24,
                cwd,
                env: process.env as Record<string, string>,
              });

              // Log history entry and update session with PID
              const pid = ptyProcess.pid;
              TerminalHistory.create({
                sessionId,
                label: label || 'Terminal',
                createdBy: username || 'unknown',
                pid,
              }).catch((err) =>
                log.error(`Failed to create history for session ${sessionId}`, err)
              );

              TerminalSession.findOneAndUpdate({ sessionId }, { $set: { pid } }).catch((err) =>
                log.error(`Failed to update session PID for ${sessionId}`, err)
              );

              session = {
                ptyProcess,
                buffer: [],
                lastActive: Date.now(),
                sockets: new Set([socket.id]),
                label: label || 'Terminal',
                createdBy: username || 'unknown',
              };
              ptySessions.set(sessionId, session);

              ptyProcess.onData((data) => {
                // Update buffer
                session!.buffer.push(data);
                if (session!.buffer.length > BUFFER_SIZE) {
                  session!.buffer.shift();
                }

                // Broadcast to all sockets attached to this session
                for (const sid of session!.sockets) {
                  io.to(sid).emit('terminal:data', data);
                }
              });

              ptyProcess.onExit(async ({ exitCode, signal }) => {
                log.info(`Terminal process for session ${sessionId} exited (${exitCode})`);

                try {
                  await connectDB();
                  const history = await TerminalHistory.findOne({
                    sessionId,
                    closedAt: { $exists: false },
                  });
                  if (history) {
                    history.closedAt = new Date();
                    history.exitCode = exitCode;
                    history.signal = signal ? String(signal) : undefined;
                    history.closedBy = 'process-exit';
                    await history.save();
                  }
                } catch (err) {
                  log.error(`Failed to update history for exited session ${sessionId}`, err);
                }

                for (const sid of session!.sockets) {
                  io.to(sid).emit('terminal:exit', { exitCode, signal });
                }
                ptySessions.delete(sessionId);
              });

              if (options.initialCommand) {
                ptyProcess.write(options.initialCommand);
              }
            }
          } catch (err: unknown) {
            log.error(`Failed to start/attach terminal session ${sessionId}`, err);
            socket.emit('terminal:error', 'Failed to start terminal');
          }
        }
      );

      socket.on('terminal:data', (data: string) => {
        if (activeSessionId) {
          const session = ptySessions.get(activeSessionId);
          session?.ptyProcess.write(data);
          if (session) session.lastActive = Date.now();
        }
      });

      socket.on('terminal:resize', (size: { cols: number; rows: number }) => {
        if (activeSessionId) {
          const session = ptySessions.get(activeSessionId);
          session?.ptyProcess.resize(size.cols, size.rows);
          if (session) session.lastActive = Date.now();
        }
      });

      socket.on('disconnect', () => {
        log.info('Socket disconnected: ' + socket.id);
        if (activeSessionId) {
          const session = ptySessions.get(activeSessionId);
          if (session) {
            session.sockets.delete(socket.id);
            session.lastActive = Date.now();
          }
        }
      });
    });

    // Fleet Management (Phase 2): optional hub orchestrators + TTY namespace.
    if (process.env.FLEET_HUB_ORCHESTRATORS_ENABLED === 'true') {
      try {
        const { registerFleetTtyNamespace } = await import('./lib/fleet/fleetTtyNamespace');
        const { HubTtyBridge } = await import('./lib/fleet/hubTtyBridge');
        const { getFrpOrchestrator, getNginxOrchestrator } =
          await import('./lib/fleet/orchestrators');
        const { enforceResourceGuard } = await import('./lib/fleet/resourceGuardMiddleware');
        const { default: ResourcePolicy } = await import('./models/ResourcePolicy');
        const { default: FleetLogEvent } = await import('./models/FleetLogEvent');
        // Touch nginx orchestrator so its singleton is ready when apply calls land.
        void getNginxOrchestrator();
        const frpOrch = getFrpOrchestrator() as { start?: () => void };
        frpOrch.start?.();
        const { default: NodeModel } = await import('./models/Node');
        const bridge = new HubTtyBridge({
          resolveAgentEndpoint: async (nodeId) => {
            await connectDB();
            const node = await NodeModel.findById(nodeId).lean();
            if (!node || !node.ptyBridge?.port || !node.ptyBridge?.authToken) {
              return null;
            }
            // The agent's PTY bridge is reached via the Hub's loopback
            // since frps maps the remote agent's local port to a hub-side port.
            return {
              host: '127.0.0.1',
              port: node.ptyBridge.port,
              authToken: node.ptyBridge.authToken,
            };
          },
          wsFactory: (url, _protocols, headers) => {
            const WS = require('ws');
            const ws = new WS(url, { headers });
            const emitter = new (require('node:events').EventEmitter)();

            ws.on('open', () => emitter.emit('open'));
            ws.on('message', (data: any) => emitter.emit('message', data));
            ws.on('error', (err: any) => emitter.emit('error', err));
            ws.on('close', (code: any, reason: any) => emitter.emit('close', code, reason));

            return Object.assign(emitter, {
              send: (data: any) => ws.send(data),
              close: (code: any, reason: any) => ws.close(code, reason),
              get readyState() {
                return ws.readyState;
              },
              off: (event: string, listener: any) => emitter.removeListener(event, listener),
            }) as any;
          },
        });
        registerFleetTtyNamespace({
          io,
          bridge,
          verifySession: async (cookieHeader) => {
            if (!cookieHeader) return null;
            const sessionCookie = cookieHeader
              .split(';')
              .find((c) => c.trim().startsWith('session='))
              ?.split('=')[1];
            if (!sessionCookie) return null;
            const s = (await decrypt(sessionCookie).catch(() => null)) as {
              user?: { id: string; role: string };
            } | null;
            return s?.user ? { userId: s.user.id, role: s.user.role } : null;
          },
          enforceResourceGuardImpl: async (input) =>
            enforceResourceGuard({
              ...input,
              ResourcePolicy,
              FleetLogEvent,
            }),
        });
        log.info('Fleet TTY namespace registered');
      } catch (err) {
        log.error('Failed to register fleet TTY namespace', err);
      }
    }

    server.listen(port, (err?: Error) => {
      if (err) throw err;
      log.info(`> Ready on http://localhost:${port}`);
    });

    // Graceful Shutdown Handler
    const shutdown = async (signal: string) => {
      log.info(`Received ${signal}, shutting down...`);
      
      // Stop Hub Orchestrators
      if (process.env.FLEET_HUB_ORCHESTRATORS_ENABLED === 'true') {
        const { getFrpOrchestrator } = await import('./lib/fleet/orchestrators');
        const frp = getFrpOrchestrator() as any;
        if (frp && typeof frp.stop === 'function') {
          await frp.stop().catch(() => {});
        }
      }

      // Stop Agent
      if (typeof (global as any).fleetAgent?.stop === 'function') {
        await (global as any).fleetAgent.stop().catch(() => {});
      }

      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  });
}
