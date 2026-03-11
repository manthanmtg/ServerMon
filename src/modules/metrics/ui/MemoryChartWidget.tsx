'use client';

import React, { useEffect, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface MemoryMetric {
    memory: number;
    timestamp: string;
}

export default function MemoryHistoryWidget() {
    const [data, setData] = useState<MemoryMetric[]>([]);

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
                            <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" opacity={0.2} />
                        <XAxis dataKey="timestamp" hide />
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
                            itemStyle={{ color: '#ec4899', fontWeight: '900' }}
                            labelStyle={{ display: 'none' }}
                        />
                        <Area
                            type="stepAfter"
                            dataKey="memory"
                            stroke="#ec4899"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#memGradient)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 flex items-center justify-between text-[9px] font-black text-slate-600 uppercase tracking-widest border-t border-white/5 pt-4">
                <div className="flex items-center gap-1.5 text-pink-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.5)]" />
                    <span>Allocated</span>
                </div>
                <span>Paging Enabled</span>
                <div className="flex items-center gap-1.5 text-slate-500">
                    <span>Reserved</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600 shadow-[0_0_8px_rgba(71,85,105,0.5)]" />
                </div>
            </div>
        </div>
    );
}
