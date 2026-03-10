'use client';

import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '@/lib/ThemeContext';

interface TerminalUIProps {
    onData?: (data: string) => void;
    onBinary?: (data: string) => void;
}

export default function TerminalUI({ onData }: TerminalUIProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
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

        term.onData((data) => {
            onData?.(data);
        });

        term.writeln('\x1b[1;32mWelcome to ServerMon Terminal\x1b[0m');
        term.writeln('Type commands to interact with the system.');
        term.write('\r\n$ ');

        // Handle window resize
        const handleResize = () => {
            fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
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
