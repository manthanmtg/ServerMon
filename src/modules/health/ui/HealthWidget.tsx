'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Heart, Cpu } from 'lucide-react';

export default function HealthWidget() {
    const [health, setHealth] = useState({ status: 'initializing', cpu: 0 });

    useEffect(() => {
        // In a real module, we would subscribe to events via the SDK
        // But since this is a UI component, it's just a demo representation
        const interval = setInterval(() => {
            setHealth({
                status: 'healthy',
                cpu: Math.floor(Math.random() * 20) + 5
            });
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="p-6 rounded-2xl border shadow-sm transition-all"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold opacity-40 uppercase tracking-wider">Module: Health</span>
                <Activity className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--primary)', opacity: 0.1 }}>
                        <Heart className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                    </div>
                    <div>
                        <p className="text-xl font-bold uppercase tracking-tight" style={{ color: 'var(--primary)' }}>
                            {health.status}
                        </p>
                        <p className="text-xs opacity-50">System Core Integrity</p>
                    </div>
                </div>

                <div className="pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex justify-between items-center text-xs mb-1">
                        <span className="opacity-50 flex items-center gap-1">
                            <Cpu className="w-3 h-3" /> Internal Load
                        </span>
                        <span className="font-bold">{health.cpu}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--secondary)' }}>
                        <div
                            className="h-full transition-all duration-500"
                            style={{ width: `${health.cpu}%`, backgroundColor: 'var(--primary)' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
