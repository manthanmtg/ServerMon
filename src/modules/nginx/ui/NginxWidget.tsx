'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    CheckCircle,
    Globe,
    LoaderCircle,
    Lock,
    Server,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { NginxSnapshot } from '../types';

export default function NginxWidget() {
    const [snapshot, setSnapshot] = useState<NginxSnapshot | null>(null);
    const [initialLoad, setInitialLoad] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/modules/nginx', { cache: 'no-store' });
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
        const interval = window.setInterval(load, 15000);
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

    return (
        <Card className="border-border/60">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-primary" />
                        Nginx
                    </CardTitle>
                    {snapshot?.status.running ? (
                        <Badge variant="success" className="text-[10px]">Running</Badge>
                    ) : (
                        <Badge variant="destructive" className="text-[10px]">Stopped</Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div className="flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-primary" />
                        <span className="text-muted-foreground">V-Hosts</span>
                        <span className="ml-auto font-semibold">{snapshot?.summary.totalVhosts ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3 text-success" />
                        <span className="text-muted-foreground">Enabled</span>
                        <span className="ml-auto font-semibold">{snapshot?.summary.enabledVhosts ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-warning" />
                        <span className="text-muted-foreground">SSL</span>
                        <span className="ml-auto font-semibold">{snapshot?.summary.sslVhosts ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Server className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Version</span>
                        <span className="ml-auto font-semibold text-[10px]">{snapshot?.status.version || 'N/A'}</span>
                    </div>
                </div>
                {snapshot?.connections && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2 text-xs">
                        <span className="text-muted-foreground">Active:</span>
                        <span className="font-semibold">{snapshot.connections.active}</span>
                        <span className="text-muted-foreground ml-2">Req:</span>
                        <span className="font-semibold">{snapshot.connections.requests.toLocaleString()}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
