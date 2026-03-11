'use client';

import React, { useEffect, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

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
        <div className="w-full h-full flex flex-col animate-fade-in relative">
            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" opacity={0.2} />
                        <XAxis
                            dataKey="timestamp"
                            hide
                        />
                        <YAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }}
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#0f172a',
                                borderColor: 'rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                fontSize: '10px',
                                color: '#f8fafc',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}
                            itemStyle={{ color: '#6366f1', fontWeight: '900' }}
                            labelStyle={{ display: 'none' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="cpu"
                            stroke="#6366f1"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#cpuGradient)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 flex items-center justify-between text-[9px] font-black text-slate-600 uppercase tracking-widest border-t border-white/5 pt-4">
                <div className="flex items-center gap-1.5 text-indigo-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                    <span>0% Min</span>
                </div>
                <span>Sync Node Core</span>
                <div className="flex items-center gap-1.5 text-rose-400">
                    <span>100% Peak</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                </div>
            </div>
        </div>
    );
}
