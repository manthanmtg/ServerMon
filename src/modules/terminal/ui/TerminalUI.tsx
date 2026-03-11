'use client';

import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '@/lib/ThemeContext';
import { io, Socket } from 'socket.io-client';

interface TerminalUIProps {
    onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting') => void;
}

export default function TerminalUI({ onStatusChange }: TerminalUIProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const { theme } = useTheme();

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize Xterm
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            theme: {
                background: theme.colors.background,
                foreground: theme.colors.foreground,
                cursor: theme.colors.primary,
                black: theme.colors.background,
                red: theme.colors.destructive,
                green: theme.colors.primary,
                yellow: theme.colors.accent,
                blue: theme.colors.primary,
                magenta: theme.colors.accent,
                cyan: theme.colors.primary,
                white: theme.colors.foreground,
            },
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;

        // Initialize Socket.io
        const socket = io({
            path: '/api/socket',
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            onStatusChange?.('connected');
            socket.emit('terminal:start', {
                cols: term.cols,
                rows: term.rows,
            });
        });

        socket.on('connect_error', (_err) => {
            onStatusChange?.('disconnected');
        });

        socket.on('disconnect', (_reason) => {
            onStatusChange?.('disconnected');
        });

        socket.on('terminal:data', (data: string) => {
            term.write(data);
        });

        term.onData((data) => {
            socket.emit('terminal:data', data);
        });

        term.onResize((size) => {
            socket.emit('terminal:resize', { cols: size.cols, rows: size.rows });
        });

        // Handle window resize
        const handleResize = () => {
            fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            socket.disconnect();
            term.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Update theme dynamically
    useEffect(() => {
        if (xtermRef.current) {
            xtermRef.current.options.theme = {
                background: theme.colors.background,
                foreground: theme.colors.foreground,
                cursor: theme.colors.primary,
                black: theme.colors.background,
                red: theme.colors.destructive,
                green: theme.colors.primary,
                yellow: theme.colors.accent,
                blue: theme.colors.primary,
                magenta: theme.colors.accent,
                cyan: theme.colors.primary,
                white: theme.colors.foreground,
            };
        }
    }, [theme.colors]);

    return (
        <div
            ref={terminalRef}
            className="w-full h-full min-h-[400px] rounded-xl overflow-hidden p-2"
            style={{ backgroundColor: theme.colors.background }}
        />
    );
}
