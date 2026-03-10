'use client';

import React, { useEffect, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Activity, Database } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';

export default function MemoryHistoryWidget() {
    const [data, setData] = useState<any[]>([]);
    const { theme } = useTheme();

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
                    <Database className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                    <span className="text-sm font-semibold opacity-40 uppercase tracking-wider">Memory Utilization</span>
                </div>
                <div className="flex items-center gap-1.5 font-bold text-[10px] opacity-20 italic">
                    Paging Enabled
                </div>
            </div>

            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.2} />
                        <XAxis dataKey="timestamp" hide />
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
                                borderRadius: '8px'
                            }}
                            itemStyle={{ color: 'var(--accent)', fontWeight: 'bold' }}
                            labelStyle={{ display: 'none' }}
                        />
                        <Area
                            type="stepAfter"
                            dataKey="memory"
                            stroke="var(--accent)"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#memGradient)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] font-bold opacity-30 uppercase">
                <span>Available</span>
                <span>Sub-second Audit</span>
                <span>Reserved</span>
            </div>
        </div>
    );
}
