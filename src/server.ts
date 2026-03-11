import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import * as pty from 'node-pty';
import os from 'os';
import { createLogger } from './lib/logger';

const log = createLogger('server');
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT || '8912', 10);

// Database imports for settings
import connectDB from './lib/db';
import TerminalSettings from './models/TerminalSettings';

app.prepare().then(() => {
    const server = createServer((req, res) => {
        const parsedUrl = parse(req.url!, true);
        const { pathname } = parsedUrl;

        if (pathname?.startsWith('/api/socket')) {
            return;
        }

        handle(req, res, parsedUrl);
    });

    const io = new Server(server, {
        path: '/api/socket',
    });

    // Persistent PTY sessions
    interface ptySession {
        ptyProcess: pty.IPty;
        buffer: string[];
        lastActive: number;
        sockets: Set<string>;
    }
    const ptySessions = new Map<string, ptySession>();
    const BUFFER_SIZE = 1000;
    const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    // Cleanup idle sessions
    setInterval(() => {
        const now = Date.now();
        for (const [sessionId, session] of ptySessions.entries()) {
            if (session.sockets.size === 0 && now - session.lastActive > SESSION_TIMEOUT) {
                log.info(`Cleaning up idle terminal session: ${sessionId}`);
                session.ptyProcess.kill();
                ptySessions.delete(sessionId);
            }
        }
    }, 60000);

    io.on('connection', (socket) => {
        log.info('New socket connection: ' + socket.id);

        let activeSessionId: string | null = null;

        socket.on('terminal:start', async (options: { sessionId: string; cols?: number; rows?: number }) => {
            const { sessionId } = options;
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
                } else {
                    let shell = '';
                    let args: string[] = [];

                    // Fetch settings for loginAsUser
                    await connectDB();
                    const settings = await TerminalSettings.findById('terminal-settings').lean();
                    const loginAsUser = settings?.loginAsUser;

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
                    
                    const cwd = process.cwd(); 

                    const ptyProcess = pty.spawn(shell, args, {
                        name: 'xterm-color',
                        cols: options.cols || 80,
                        rows: options.rows || 24,
                        cwd,
                        env: process.env as Record<string, string>,
                    });

                    session = {
                        ptyProcess,
                        buffer: [],
                        lastActive: Date.now(),
                        sockets: new Set([socket.id]),
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

                    ptyProcess.onExit(({ exitCode, signal }) => {
                        log.info(`Terminal process for session ${sessionId} exited (${exitCode})`);
                        for (const sid of session!.sockets) {
                            io.to(sid).emit('terminal:exit', { exitCode, signal });
                        }
                        ptySessions.delete(sessionId);
                    });
                }
            } catch (err: unknown) {
                log.error(`Failed to start/attach terminal session ${sessionId}`, err);
                socket.emit('terminal:error', 'Failed to start terminal');
            }
        });

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

    server.listen(port, (err?: Error) => {
        if (err) throw err;
        log.info(`> Ready on http://localhost:${port}`);
    });
});
