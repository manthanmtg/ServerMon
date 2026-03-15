'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Clock,
    LoaderCircle,
    Play,
    Pause,
    Timer,
    Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CronsSnapshot } from '../types';

function relativeTime(iso: string): string {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff < 0) return 'overdue';
    const minutes = Math.round(diff / 60_000);
    if (minutes < 1) return '< 1m';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}

export default function CronsWidget() {
    const [snapshot, setSnapshot] = useState<CronsSnapshot | null>(null);
    const [initialLoad, setInitialLoad] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/modules/crons', { cache: 'no-store' });
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
        const interval = window.setInterval(load, 30000);
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
                        <Clock className="w-4 h-4 text-primary" />
                        Cron Jobs
                    </CardTitle>
                    <Badge variant={snapshot?.crontabAvailable ? 'success' : 'warning'} className="text-[10px]">
                        {snapshot?.source || 'unknown'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div className="flex items-center gap-1.5">
                        <Play className="w-3 h-3 text-success" />
                        <span className="text-muted-foreground">Active</span>
                        <span className="ml-auto font-semibold">{s?.active ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Pause className="w-3 h-3 text-warning" />
                        <span className="text-muted-foreground">Disabled</span>
                        <span className="ml-auto font-semibold">{s?.disabled ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-primary" />
                        <span className="text-muted-foreground">User</span>
                        <span className="ml-auto font-semibold">{s?.userCrons ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Timer className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">System</span>
                        <span className="ml-auto font-semibold">{s?.systemCrons ?? 0}</span>
                    </div>
                </div>
                {s?.nextRunTime && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
                        <Clock className={cn('w-3.5 h-3.5 text-primary shrink-0')} />
                        <span className="text-foreground">
                            Next: <span className="font-medium">{s.nextRunJob || 'job'}</span>
                            <span className="text-muted-foreground ml-1">in {relativeTime(s.nextRunTime)}</span>
                        </span>
                    </div>
                )}
                <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground pt-3 border-t border-border/40">
                    <span>{snapshot?.summary.total ?? 0} total</span>
                    <span>{snapshot?.summary.userCrons ?? 0} user · {snapshot?.summary.systemCrons ?? 0} sys</span>
                </div>
            </CardContent>
        </Card>
    );
}
