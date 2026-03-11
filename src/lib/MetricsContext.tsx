'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';

export interface SystemMetric {
    timestamp: string;
    cpu: number;
    memory: number;
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

export function MetricsProvider({ children }: { children: React.ReactNode }) {
    const [latest, setLatest] = useState<SystemMetric | null>(null);
    const [history, setHistory] = useState<SystemMetric[]>([]);
    const [connected, setConnected] = useState(false);
    const esRef = useRef<EventSource | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const connect = useCallback(() => {
        if (esRef.current) {
            esRef.current.close();
        }

        const es = new EventSource('/api/metrics/stream');
        esRef.current = es;

        es.onmessage = (event) => {
            try {
                const metric: SystemMetric = JSON.parse(event.data);
                setLatest(metric);
                setConnected(true);
                setHistory((prev) => {
                    const next = [...prev, metric];
                    return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
                });
            } catch {
                // ignore malformed messages
            }
        };

        es.onerror = () => {
            setConnected(false);
            es.close();
            esRef.current = null;
            reconnectTimer.current = setTimeout(connect, 3000);
        };
    }, []);

    useEffect(() => {
        connect();
        return () => {
            esRef.current?.close();
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        };
    }, [connect]);

    return (
        <MetricsContext.Provider value={{ latest, history, connected }}>
            {children}
        </MetricsContext.Provider>
    );
}

export function useMetrics() {
    return useContext(MetricsContext);
}
