'use client';

import React, { useEffect, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Cpu } from 'lucide-react';

interface CPUMetric {
    cpu: number;
    timestamp: string;
}

export default function CPUHistoryWidget() {
    const [data, setData] = useState<CPUMetric[]>([]);

    useEffect(() => {
        const eventSource = new EventSource('/api/metrics/stream');

        eventSource.onmessage = (event) => {
            const metric = JSON.parse(event.data);
            setData((prev) => {
                const newData = [...prev, metric];
                return newData.slice(-30); // Show last 30 data points
            });
        };

        eventSource.onerror = (err) => {
            console.error('SSE Error:', err);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, []);

    return (
        <div className="p-6 rounded-2xl border shadow-sm flex flex-col h-[300px]"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                    <span className="text-sm font-semibold opacity-40 uppercase tracking-wider">CPU History (Live)</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-bold opacity-30">CONNECTED</span>
                </div>
            </div>

            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.2} />
                        <XAxis
                            dataKey="timestamp"
                            hide
                        />
                        <YAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 10, fill: 'var(--foreground)', opacity: 0.3 }}
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--card)',
                                borderColor: 'var(--border)',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: 'var(--foreground)'
                            }}
                            itemStyle={{ color: 'var(--primary)', fontWeight: 'bold' }}
                            labelStyle={{ display: 'none' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="cpu"
                            stroke="var(--primary)"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#cpuGradient)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] font-bold opacity-30 uppercase">
                <span>0% Load</span>
                <span>Real-time Pulse (1s)</span>
                <span>100% Load</span>
            </div>
        </div>
    );
}
