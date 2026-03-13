'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle,
    LoaderCircle,
    ShieldCheck,
    XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CertificatesSnapshot } from '../types';

export default function CertificatesWidget() {
    const [snapshot, setSnapshot] = useState<CertificatesSnapshot | null>(null);
    const [initialLoad, setInitialLoad] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/modules/certificates', { cache: 'no-store' });
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
        const interval = window.setInterval(load, 60000);
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
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        Certificates
                    </CardTitle>
                    <Badge variant={snapshot?.source === 'live' ? 'success' : 'warning'} className="text-[10px]">
                        {snapshot?.source || 'unknown'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3 text-success" />
                        <span className="text-muted-foreground">Valid</span>
                        <span className="ml-auto font-semibold">{s?.valid ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-warning" />
                        <span className="text-muted-foreground">Expiring</span>
                        <span className={cn('ml-auto font-semibold', (s?.expiringSoon ?? 0) > 0 && 'text-warning')}>
                            {s?.expiringSoon ?? 0}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <XCircle className="w-3 h-3 text-destructive" />
                        <span className="text-muted-foreground">Expired</span>
                        <span className={cn('ml-auto font-semibold', (s?.expired ?? 0) > 0 && 'text-destructive')}>
                            {s?.expired ?? 0}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Total</span>
                        <span className="ml-auto font-semibold">{s?.total ?? 0}</span>
                    </div>
                </div>
                {s?.nearestDomain && s.nearestExpiry !== null && (
                    <div className={cn(
                        'mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs border',
                        s.nearestExpiry <= 7
                            ? 'bg-destructive/5 border-destructive/20'
                            : s.nearestExpiry <= 30
                                ? 'bg-warning/5 border-warning/20'
                                : 'bg-success/5 border-success/20',
                    )}>
                        <span className={cn(
                            'font-medium',
                            s.nearestExpiry <= 7 ? 'text-destructive' : s.nearestExpiry <= 30 ? 'text-warning' : 'text-success',
                        )}>
                            {s.nearestDomain}: {s.nearestExpiry}d until expiry
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
