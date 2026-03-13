'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Cpu,
    LoaderCircle,
    MemoryStick,
    Thermometer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatBytes } from '@/lib/utils';
import type { HardwareSnapshot } from '../types';

export default function HardwareWidget() {
    const [snapshot, setSnapshot] = useState<HardwareSnapshot | null>(null);
    const [initialLoad, setInitialLoad] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/modules/hardware', { cache: 'no-store' });
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

    const temp = snapshot?.cpuTemperature.main ?? 0;
    const tempColor = temp > 80 ? 'text-destructive' : temp > 60 ? 'text-warning' : 'text-success';

    return (
        <Card className="border-border/60">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-primary" />
                        Hardware
                    </CardTitle>
                    <Badge variant={snapshot?.source === 'live' ? 'success' : 'warning'} className="text-[10px]">
                        {snapshot?.source || 'unknown'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <Cpu className="w-3 h-3" /> CPU
                        </span>
                        <span className="font-medium truncate ml-2 max-w-[60%] text-right">
                            {snapshot?.cpu.brand || 'Unknown'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <Thermometer className="w-3 h-3" /> Temp
                        </span>
                        <span className={`font-semibold ${tempColor}`}>
                            {temp > 0 ? `${temp.toFixed(0)}°C` : 'N/A'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <MemoryStick className="w-3 h-3" /> RAM
                        </span>
                        <span className="font-medium">
                            {formatBytes(snapshot?.memory.used ?? 0)} / {formatBytes(snapshot?.memory.total ?? 0)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Cores</span>
                        <span className="font-medium">{snapshot?.cpu.cores ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Disks</span>
                        <span className="font-medium">{snapshot?.disks.length ?? 0}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
