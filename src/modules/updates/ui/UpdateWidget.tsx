'use client';

import React, { useEffect, useState } from 'react';
import { Package, ShieldAlert, AlertCircle } from 'lucide-react';
import type { UpdateSnapshot } from '../types';

export default function UpdateWidget() {
    const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null);

    useEffect(() => {
        const fetchUpdates = async () => {
            try {
                const res = await fetch('/api/modules/updates');
                const data = await res.json();
                setSnapshot(data);
            } catch { /* ignore */ }
        };

        fetchUpdates();
        const interval = setInterval(fetchUpdates, 3600000); // Check every hour
        return () => clearInterval(interval);
    }, []);

    if (!snapshot) return null;

    const total = snapshot.counts.security + snapshot.counts.regular + snapshot.counts.language;
    if (total === 0 && !snapshot.pendingRestart) {
        return (
            <div className="flex flex-col items-center justify-center py-4 bg-success/5 border border-success/10 rounded-xl">
                <Package className="w-8 h-8 text-success mb-2 opacity-50" />
                <span className="text-xs font-medium text-success">System Up to Date</span>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground font-medium">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="text-xs uppercase tracking-wider">Updates</span>
                </div>
                {total > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground tabular-nums">
                        {total} Pending
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 gap-2">
                {snapshot.counts.security > 0 && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-destructive/5 border border-destructive/10">
                        <div className="flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-destructive" />
                            <span className="text-xs font-medium">Security Updates</span>
                        </div>
                        <span className="text-xs font-bold text-destructive">{snapshot.counts.security}</span>
                    </div>
                )}
                
                {snapshot.pendingRestart && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-warning/5 border border-warning/10">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-warning" />
                            <span className="text-xs font-medium">Reboot Required</span>
                        </div>
                        <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                    </div>
                )}

                {snapshot.counts.regular > 0 && total > 0 && snapshot.counts.security === 0 && !snapshot.pendingRestart && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-primary" />
                            <span className="text-xs font-medium">Package Updates</span>
                        </div>
                        <span className="text-xs font-bold text-primary">{total}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
