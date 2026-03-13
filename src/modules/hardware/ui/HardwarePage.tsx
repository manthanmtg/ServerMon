'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Cpu,
    HardDrive,
    LoaderCircle,
    MemoryStick,
    Monitor,
    RefreshCw,
    Server,
    Thermometer,
    Usb,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatBytes } from '@/lib/utils';
import type { HardwareSnapshot } from '../types';

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function TempGauge({ value, label }: { value: number; label: string }) {
    const pct = Math.min(100, (value / 100) * 100);
    const color = value > 80 ? 'bg-destructive' : value > 60 ? 'bg-warning' : 'bg-success';
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn('font-semibold', value > 80 ? 'text-destructive' : value > 60 ? 'text-warning' : 'text-success')}>
                    {value > 0 ? `${value.toFixed(0)}°C` : 'N/A'}
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default function HardwarePage() {
    const [snapshot, setSnapshot] = useState<HardwareSnapshot | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/modules/hardware', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setSnapshot(data);
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = window.setInterval(load, 15000);
        return () => window.clearInterval(interval);
    }, [load]);

    if (loading && !snapshot) {
        return (
            <div className="flex items-center justify-center py-24">
                <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    if (!snapshot) return null;

    const memPct = snapshot.memory.total > 0 ? ((snapshot.memory.used / snapshot.memory.total) * 100).toFixed(1) : '0';

    return (
        <div className="space-y-6">
            {/* System Overview */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Badge variant={snapshot.source === 'live' ? 'success' : 'warning'} className="text-[10px]">
                        {snapshot.source}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Uptime: {formatUptime(snapshot.uptime)}</span>
                </div>
                <button
                    onClick={load}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* System / OS Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="border-border/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <Monitor className="w-4 h-4 text-primary" />
                            System
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Hostname</span><span className="font-medium">{snapshot.os.hostname}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Platform</span><span className="font-medium">{snapshot.os.platform}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Kernel</span><span className="font-medium truncate ml-2 max-w-[60%] text-right">{snapshot.os.kernel}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Arch</span><span className="font-medium">{snapshot.os.arch}</span></div>
                        {snapshot.os.distro && <div className="flex justify-between"><span className="text-muted-foreground">Distro</span><span className="font-medium">{snapshot.os.distro} {snapshot.os.release}</span></div>}
                        {snapshot.system.manufacturer && <div className="flex justify-between"><span className="text-muted-foreground">Manufacturer</span><span className="font-medium">{snapshot.system.manufacturer}</span></div>}
                        {snapshot.system.model && <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span className="font-medium">{snapshot.system.model}</span></div>}
                    </CardContent>
                </Card>

                {/* CPU */}
                <Card className="border-border/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <Cpu className="w-4 h-4 text-primary" />
                            CPU
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span className="font-medium truncate ml-2 max-w-[65%] text-right">{snapshot.cpu.brand}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Manufacturer</span><span className="font-medium">{snapshot.cpu.manufacturer}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Cores</span><span className="font-medium">{snapshot.cpu.cores} ({snapshot.cpu.physicalCores} physical)</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Speed</span><span className="font-medium">{snapshot.cpu.speed} GHz</span></div>
                        {snapshot.cpu.speedMax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Max Speed</span><span className="font-medium">{snapshot.cpu.speedMax} GHz</span></div>}
                        {snapshot.cpu.socket && <div className="flex justify-between"><span className="text-muted-foreground">Socket</span><span className="font-medium">{snapshot.cpu.socket}</span></div>}
                        {snapshot.cpu.cache.l3 > 0 && <div className="flex justify-between"><span className="text-muted-foreground">L3 Cache</span><span className="font-medium">{formatBytes(snapshot.cpu.cache.l3)}</span></div>}
                    </CardContent>
                </Card>

                {/* Memory */}
                <Card className="border-border/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <MemoryStick className="w-4 h-4 text-primary" />
                            Memory
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                        <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">{formatBytes(snapshot.memory.total)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Used</span><span className="font-medium">{formatBytes(snapshot.memory.used)} ({memPct}%)</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Available</span><span className="font-medium">{formatBytes(snapshot.memory.available)}</span></div>
                        {snapshot.memory.swaptotal > 0 && (
                            <>
                                <div className="flex justify-between"><span className="text-muted-foreground">Swap Total</span><span className="font-medium">{formatBytes(snapshot.memory.swaptotal)}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Swap Used</span><span className="font-medium">{formatBytes(snapshot.memory.swapused)}</span></div>
                            </>
                        )}
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                                className={cn('h-full rounded-full transition-all', parseFloat(memPct) > 90 ? 'bg-destructive' : parseFloat(memPct) > 70 ? 'bg-warning' : 'bg-primary')}
                                style={{ width: `${memPct}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Temperature Sensors */}
            <Card className="border-border/60">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Thermometer className="w-4 h-4 text-primary" />
                        Temperature Sensors
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {snapshot.cpuTemperature.main > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <TempGauge value={snapshot.cpuTemperature.main} label="CPU Main" />
                            {snapshot.cpuTemperature.cores.map((temp, i) => (
                                <TempGauge key={i} value={temp} label={`Core ${i}`} />
                            ))}
                            {snapshot.cpuTemperature.max > 0 && snapshot.cpuTemperature.max !== snapshot.cpuTemperature.main && (
                                <TempGauge value={snapshot.cpuTemperature.max} label="CPU Max" />
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            Temperature sensors not available on this platform
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Memory Layout */}
            {snapshot.memoryLayout.length > 0 && (
                <Card className="border-border/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <MemoryStick className="w-4 h-4 text-primary" />
                            Memory Modules
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-border bg-secondary/50">
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Bank</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Size</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Type</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Speed</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Manufacturer</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Part</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshot.memoryLayout.map((m, i) => (
                                        <tr key={i} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                                            <td className="px-4 py-2.5 font-medium">{m.bank || `Slot ${i}`}</td>
                                            <td className="px-4 py-2.5">{formatBytes(m.size)}</td>
                                            <td className="px-4 py-2.5"><Badge variant="secondary" className="text-[10px]">{m.type}</Badge></td>
                                            <td className="px-4 py-2.5">{m.clockSpeed > 0 ? `${m.clockSpeed} MHz` : '-'}</td>
                                            <td className="px-4 py-2.5 text-muted-foreground">{m.manufacturer || '-'}</td>
                                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{m.partNum || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Storage Devices */}
            {snapshot.disks.length > 0 && (
                <Card className="border-border/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <HardDrive className="w-4 h-4 text-primary" />
                            Storage Devices
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-border bg-secondary/50">
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Device</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Name</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Type</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Size</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Interface</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">SMART</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Temp</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshot.disks.map((d, i) => (
                                        <tr key={i} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                                            <td className="px-4 py-2.5 font-mono">{d.device}</td>
                                            <td className="px-4 py-2.5 font-medium">{d.name}</td>
                                            <td className="px-4 py-2.5"><Badge variant="secondary" className="text-[10px]">{d.type}</Badge></td>
                                            <td className="px-4 py-2.5">{d.size > 0 ? formatBytes(d.size) : '-'}</td>
                                            <td className="px-4 py-2.5 text-muted-foreground">{d.interfaceType || '-'}</td>
                                            <td className="px-4 py-2.5">
                                                <Badge variant={d.smartStatus === 'OK' ? 'success' : d.smartStatus === 'unknown' ? 'secondary' : 'destructive'} className="text-[10px]">
                                                    {d.smartStatus}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2.5">{d.temperature > 0 ? `${d.temperature}°C` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* GPUs */}
            {snapshot.gpus.length > 0 && (
                <Card className="border-border/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Monitor className="w-4 h-4 text-primary" />
                            GPU
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {snapshot.gpus.map((gpu, i) => (
                                <div key={i} className="p-3 rounded-lg border border-border/60 space-y-1.5 text-xs">
                                    <p className="font-medium">{gpu.vendor} {gpu.model}</p>
                                    {gpu.vram > 0 && <div className="flex justify-between"><span className="text-muted-foreground">VRAM</span><span>{gpu.vram} MB</span></div>}
                                    {gpu.driver && <div className="flex justify-between"><span className="text-muted-foreground">Driver</span><span>{gpu.driver}</span></div>}
                                    {gpu.temperatureGpu > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Temperature</span><span>{gpu.temperatureGpu}°C</span></div>}
                                    {gpu.utilizationGpu > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Utilization</span><span>{gpu.utilizationGpu}%</span></div>}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* USB Devices */}
            {snapshot.usb.length > 0 && (
                <Card className="border-border/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Usb className="w-4 h-4 text-primary" />
                            USB Devices
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-border bg-secondary/50">
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Name</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Bus</th>
                                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshot.usb.map((u, i) => (
                                        <tr key={i} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                                            <td className="px-4 py-2.5 font-medium">{u.name}</td>
                                            <td className="px-4 py-2.5 text-muted-foreground">Bus {u.bus}</td>
                                            <td className="px-4 py-2.5"><Badge variant="secondary" className="text-[10px]">{u.type || 'Device'}</Badge></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* BIOS / Baseboard */}
            {(snapshot.bios.vendor || snapshot.baseboard.manufacturer) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {snapshot.bios.vendor && (
                        <Card className="border-border/60">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <Server className="w-4 h-4 text-primary" />
                                    BIOS
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-1.5 text-xs">
                                <div className="flex justify-between"><span className="text-muted-foreground">Vendor</span><span className="font-medium">{snapshot.bios.vendor}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span className="font-medium">{snapshot.bios.version}</span></div>
                                {snapshot.bios.releaseDate && <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{snapshot.bios.releaseDate}</span></div>}
                            </CardContent>
                        </Card>
                    )}
                    {snapshot.baseboard.manufacturer && (
                        <Card className="border-border/60">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <Server className="w-4 h-4 text-primary" />
                                    Baseboard
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-1.5 text-xs">
                                <div className="flex justify-between"><span className="text-muted-foreground">Manufacturer</span><span className="font-medium">{snapshot.baseboard.manufacturer}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span className="font-medium">{snapshot.baseboard.model}</span></div>
                                {snapshot.baseboard.memSlots > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Memory Slots</span><span className="font-medium">{snapshot.baseboard.memSlots}</span></div>}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
