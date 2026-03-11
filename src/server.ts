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

    io.on('connection', (socket) => {
        log.info('New socket connection: ' + socket.id);

        let ptyProcess: pty.IPty | null = null;

        socket.on('terminal:start', async (options: { cols?: number; rows?: number } = {}) => {
            try {
                if (ptyProcess) return;

                let shell = '';
                if (os.platform() === 'win32') {
                    shell = 'powershell.exe';
                } else {
                    // Try to use the user's preferred shell, fallback to common defaults
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
                    
                    if (!shell) shell = 'sh'; // Universal fallback
                }
                
                const cwd = process.cwd(); 
                
                log.info(`Spawning PTY (shell: ${shell}, cwd: ${cwd})`);

                ptyProcess = pty.spawn(shell, [], {
                    name: 'xterm-color',
                    cols: options.cols || 80,
                    rows: options.rows || 24,
                    cwd,
                    env: process.env as Record<string, string>,
                });

                log.info(`Terminal process started (pid: ${ptyProcess.pid})`);

                ptyProcess.onData((data) => {
                    socket.emit('terminal:data', data);
                });

                ptyProcess.onExit(({ exitCode, signal }) => {
                    log.info(`Terminal process ${ptyProcess?.pid} exited (${exitCode})`);
                    socket.emit('terminal:exit', { exitCode, signal });
                    ptyProcess = null;
                });
            } catch (err: unknown) {
                log.error('Failed to spawn terminal process', err);
                socket.emit('terminal:error', 'Failed to start terminal');
            }
        });

        socket.on('terminal:data', (data: string) => {
            ptyProcess?.write(data);
        });

        socket.on('terminal:resize', (size: { cols: number; rows: number }) => {
            ptyProcess?.resize(size.cols, size.rows);
        });

        socket.on('disconnect', () => {
            log.info('Socket disconnected: ' + socket.id);
            if (ptyProcess) {
                ptyProcess.kill();
                ptyProcess = null;
            }
        });
    });

    server.listen(port, (err?: Error) => {
        if (err) throw err;
        log.info(`> Ready on http://localhost:${port}`);
    });
});
