'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle,
    Cog,
    LoaderCircle,
    Play,
    Power,
    XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ServicesSnapshot } from '../types';

function MiniGauge({ score }: { score: number }) {
    const circumference = 2 * Math.PI * 18;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--destructive)';
    return (
        <div className="relative w-12 h-12">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle
                    cx="22" cy="22" r="18" fill="none"
                    stroke={color}
                    strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-all duration-500"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold">{score}</span>
            </div>
        </div>
    );
}

export default function ServicesWidget() {
    const [snapshot, setSnapshot] = useState<ServicesSnapshot | null>(null);
    const [initialLoad, setInitialLoad] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/modules/services', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setSnapshot(data);
            }
        } catch {
            // silently ignore for widget
        } finally {
            setInitialLoad(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = window.setInterval(load, 10000);
        return () => window.clearInterval(interval);
    }, [load]);

    if (initialLoad && !snapshot) {
        return (
            <Card className="border-border/60">
                <CardContent className="flex items-center justify-center py-12">
                    <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    const s = snapshot?.summary;

    return (
        <Card className="border-border/60">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Cog className="w-4 h-4 text-primary" />
                        Services
                    </CardTitle>
                    <Badge variant={snapshot?.systemdAvailable ? 'success' : 'warning'} className="text-[10px]">
                        {snapshot?.source || 'unknown'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-4">
                    <MiniGauge score={s?.healthScore ?? 0} />
                    <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex items-center gap-1.5">
                            <Play className="w-3 h-3 text-success" />
                            <span className="text-muted-foreground">Running</span>
                            <span className="ml-auto font-semibold">{s?.running ?? 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <XCircle className="w-3 h-3 text-destructive" />
                            <span className="text-muted-foreground">Failed</span>
                            <span className={cn('ml-auto font-semibold', (s?.failed ?? 0) > 0 && 'text-destructive')}>{s?.failed ?? 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Power className="w-3 h-3 text-warning" />
                            <span className="text-muted-foreground">Inactive</span>
                            <span className="ml-auto font-semibold">{s?.inactive ?? 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-3 h-3 text-muted-foreground" />
                            <span className="text-muted-foreground">Total</span>
                            <span className="ml-auto font-semibold">{s?.total ?? 0}</span>
                        </div>
                    </div>
                </div>
                {(snapshot?.alerts.length ?? 0) > 0 && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <span className="text-destructive font-medium">{snapshot?.alerts.length} active alert{(snapshot?.alerts.length ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
