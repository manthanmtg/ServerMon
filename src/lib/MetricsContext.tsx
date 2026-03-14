'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

export interface SystemMetric {
    timestamp: string;
    serverTimestamp: string;
    cpu: number;
    memory: number;
    cpuCores: number;
    memTotal: number;
    memUsed: number;
    uptime: number;
    swapTotal: number;
    swapUsed: number;
    swapFree: number;
    disks: {
        fs: string;
        type: string;
        size: number;
        used: number;
        available: number;
        use: number;
        mount: string;
    }[];
    io: {
        r_sec: number;
        w_sec: number;
        t_sec: number;
        r_wait: number;
        w_wait: number;
    } | null;
}

interface MetricsContextType {
    latest: SystemMetric | null;
    history: SystemMetric[];
    connected: boolean;
}

const MetricsContext = createContext<MetricsContextType>({
    latest: null,
    history: [],
    connected: false,
});

const MAX_HISTORY = 60;
const RECONNECT_MS = 3000;

export function MetricsProvider({ children }: { children: React.ReactNode }) {
    const [latest, setLatest] = useState<SystemMetric | null>(null);
    const [history, setHistory] = useState<SystemMetric[]>([]);
    const [connected, setConnected] = useState(false);
    const esRef = useRef<EventSource | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        function connect() {
            if (!mountedRef.current) return;
            if (esRef.current) esRef.current.close();

            console.log('[MetricsContext] Connecting to SSE stream...');
            const es = new EventSource('/api/metrics/stream', { withCredentials: true });
            esRef.current = es;

            es.onopen = () => {
                console.log('[MetricsContext] SSE connection opened');
            };

            es.onmessage = (event) => {
                try {
                    const metric: SystemMetric = JSON.parse(event.data);
                    console.log('[MetricsContext] Received metric:', { memTotal: metric.memTotal, memUsed: metric.memUsed });
                    setLatest(metric);
                    setConnected(true);
                    setHistory((prev) => {
                        const next = [...prev, metric];
                        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
                    });
                } catch (err) {
                    console.error('[MetricsContext] Failed to parse metric:', err);
                }
            };

            es.onerror = (err) => {
                console.error('[MetricsContext] SSE error:', err, 'readyState:', es.readyState);
                setConnected(false);
                es.close();
                esRef.current = null;
                if (mountedRef.current) {
                    console.log('[MetricsContext] Reconnecting in', RECONNECT_MS, 'ms...');
                    reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
                }
            };
        }

        connect();

        return () => {
            mountedRef.current = false;
            esRef.current?.close();
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        };
    }, []);

    return (
        <MetricsContext.Provider value={{ latest, history, connected }}>
            {children}
        </MetricsContext.Provider>
    );
}

export function useMetrics() {
    return useContext(MetricsContext);
}
