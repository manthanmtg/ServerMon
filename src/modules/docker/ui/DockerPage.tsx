'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    AlertTriangle,
    Boxes,
    ChevronDown,
    ChevronRight,
    Database,
    LoaderCircle,
    PauseCircle,
    PlayCircle,
    RefreshCcw,
    Square,
    TerminalSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn, formatBytes } from '@/lib/utils';
import type { DockerImageSummary, DockerNetworkSummary, DockerSnapshot, DockerVolumeSummary } from '../types';
import TerminalUI from '@/modules/terminal/ui/TerminalUI';

type DataTab = 'images' | 'volumes' | 'networks';

const chartColors = ['var(--primary)', 'var(--accent)', 'var(--success)', 'var(--warning)', 'var(--destructive)'];

function relativeTime(value: string) {
    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.max(0, Math.round(diff / 60_000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

function tooltipBytes(value: number | string | undefined) {
    return formatBytes(typeof value === 'number' ? value : Number(value) || 0);
}

function statusVariant(state: string): 'success' | 'warning' | 'destructive' {
    if (state === 'running') return 'success';
    if (state === 'paused') return 'warning';
    if (state === 'restarting') return 'warning';
    return 'destructive';
}

function stateSummary(snapshot: DockerSnapshot | null) {
    if (!snapshot) {
        return [
            { label: 'Running', value: 0, icon: PlayCircle },
            { label: 'Stopped', value: 0, icon: Square },
            { label: 'Paused', value: 0, icon: PauseCircle },
        ];
    }
    return [
        { label: 'Running', value: snapshot.daemon.containersRunning, icon: PlayCircle },
        { label: 'Stopped', value: snapshot.daemon.containersStopped, icon: Square },
        { label: 'Paused', value: snapshot.daemon.containersPaused, icon: PauseCircle },
    ];
}

function DatasetTabs({
    activeTab,
    onChange,
}: {
    activeTab: DataTab;
    onChange: (tab: DataTab) => void;
}) {
    return (
        <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1">
            {(['images', 'volumes', 'networks'] as DataTab[]).map((tab) => (
                <button
                    key={tab}
                    type="button"
                    onClick={() => onChange(tab)}
                    className={cn(
                        'min-h-[44px] rounded-lg px-3 text-xs font-semibold uppercase tracking-[0.18em] transition-colors',
                        activeTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {tab}
                </button>
            ))}
        </div>
    );
}

function DataTable({
    tab,
    images,
    volumes,
    networks,
}: {
    tab: DataTab;
    images: DockerImageSummary[];
    volumes: DockerVolumeSummary[];
    networks: DockerNetworkSummary[];
}) {
    return (
        <div className="overflow-x-auto">
            {tab === 'images' && (
                <table className="min-w-full text-sm" data-testid="docker-images-table">
                    <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        <tr>
                            <th className="pb-3 pr-4">Repository</th>
                            <th className="pb-3 pr-4">Tag</th>
                            <th className="pb-3 pr-4">Size</th>
                            <th className="pb-3 pr-4">Created</th>
                            <th className="pb-3">Using</th>
                        </tr>
                    </thead>
                    <tbody>
                        {images.map((image) => (
                            <tr key={image.id} className="border-t border-border/60">
                                <td className="py-3 pr-4 font-medium">{image.repository}</td>
                                <td className="py-3 pr-4">{image.tag}</td>
                                <td className="py-3 pr-4">{formatBytes(image.sizeBytes)}</td>
                                <td className="py-3 pr-4">{relativeTime(image.createdAt)}</td>
                                <td className="py-3">{image.containersUsing}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {tab === 'volumes' && (
                <table className="min-w-full text-sm" data-testid="docker-volumes-table">
                    <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        <tr>
                            <th className="pb-3 pr-4">Name</th>
                            <th className="pb-3 pr-4">Driver</th>
                            <th className="pb-3 pr-4">Scope</th>
                            <th className="pb-3">Mountpoint</th>
                        </tr>
                    </thead>
                    <tbody>
                        {volumes.map((volume) => (
                            <tr key={volume.name} className="border-t border-border/60">
                                <td className="py-3 pr-4 font-medium">{volume.name}</td>
                                <td className="py-3 pr-4">{volume.driver}</td>
                                <td className="py-3 pr-4">{volume.scope || 'local'}</td>
                                <td className="py-3 font-mono text-xs text-muted-foreground">{volume.mountpoint || 'n/a'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {tab === 'networks' && (
                <table className="min-w-full text-sm" data-testid="docker-networks-table">
                    <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        <tr>
                            <th className="pb-3 pr-4">Name</th>
                            <th className="pb-3 pr-4">Driver</th>
                            <th className="pb-3 pr-4">Scope</th>
                            <th className="pb-3">ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {networks.map((network) => (
                            <tr key={network.id} className="border-t border-border/60">
                                <td className="py-3 pr-4 font-medium">{network.name}</td>
                                <td className="py-3 pr-4">{network.driver}</td>
                                <td className="py-3 pr-4">{network.scope || 'local'}</td>
                                <td className="py-3 font-mono text-xs text-muted-foreground">{network.id.slice(0, 12)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default function DockerPage() {
    const { toast } = useToast();
    const [snapshot, setSnapshot] = useState<DockerSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshMs, setRefreshMs] = useState(5000);
    const [activeTab, setActiveTab] = useState<DataTab>('images');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
    const [terminalCommand, setTerminalCommand] = useState('docker ps -a\n');
    const [sessionId] = useState(() => `docker-${crypto.randomUUID()}`);
    const [pendingActionId, setPendingActionId] = useState<string | null>(null);

    const loadSnapshot = useCallback(async () => {
        const response = await fetch('/api/modules/docker', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch docker data');
        }
        setSnapshot(data);
        setSelectedContainerId((currentId) => currentId || data.containers[0]?.id || null);
    }, []);

    useEffect(() => {
        let active = true;
        setLoading(true);
        loadSnapshot()
            .catch((error: unknown) => {
                if (active) {
                    toast({
                        title: 'Docker snapshot failed',
                        description: error instanceof Error ? error.message : 'Unknown error',
                        variant: 'destructive',
                    });
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });

        const interval = window.setInterval(() => {
            loadSnapshot().catch(() => {
                // Non-blocking retry loop for live dashboard updates.
            });
        }, refreshMs);

        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [loadSnapshot, refreshMs, toast]);

    const topContainers = useMemo(
        () => [...(snapshot?.containers || [])].sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 5),
        [snapshot],
    );
    const selectedContainer = snapshot?.containers.find((container) => container.id === selectedContainerId) || snapshot?.containers[0] || null;
    const ioHistory = useMemo(() => {
        if (!snapshot || !selectedContainer) return [];
        return snapshot.history.map((entry) => {
            const point = entry.containers.find((container) => container.id === selectedContainer.id);
            return {
                timestamp: new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                read: point?.blockReadBytes || 0,
                write: point?.blockWriteBytes || 0,
            };
        });
    }, [selectedContainer, snapshot]);
    const networkHistory = useMemo(() => {
        if (!snapshot) return [];
        return snapshot.history.map((entry) => {
            const top = [...entry.containers].sort((a, b) => (b.networkInBytes + b.networkOutBytes) - (a.networkInBytes + a.networkOutBytes)).slice(0, 4);
            const row: Record<string, number | string> = {
                timestamp: new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            top.forEach((container, index) => {
                row[`c${index}`] = container.networkInBytes + container.networkOutBytes;
                row[`n${index}`] = container.name;
            });
            return row;
        });
    }, [snapshot]);
    const diskChart = snapshot ? [
        { name: 'Images', value: snapshot.diskUsage.imagesBytes },
        { name: 'Containers', value: snapshot.diskUsage.containersBytes },
        { name: 'Volumes', value: snapshot.diskUsage.volumesBytes },
        { name: 'Build Cache', value: snapshot.diskUsage.buildCacheBytes },
    ] : [];

    async function runAction(containerId: string, action: 'start' | 'stop' | 'restart') {
        setPendingActionId(containerId);
        try {
            const response = await fetch(`/api/modules/docker/${containerId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to execute action');
            }
            setTerminalCommand(`docker ${action} ${data.container?.name || containerId}\n`);
            toast({ title: `${action} complete`, description: data.message, variant: 'success' });
            await loadSnapshot();
        } catch (error: unknown) {
            toast({
                title: `Docker ${action} failed`,
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive',
            });
        } finally {
            setPendingActionId(null);
        }
    }

    if (loading) {
        return (
            <div className="flex min-h-[70vh] items-center justify-center">
                <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6" data-testid="docker-page">
            <section className="rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,var(--primary)/0.18,transparent_40%),linear-gradient(180deg,var(--card),color-mix(in_oklab,var(--card)_92%,transparent))] p-4 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={snapshot?.daemonReachable ? 'success' : 'destructive'}>
                                {snapshot?.daemonReachable ? 'Daemon connected' : 'Daemon unreachable'}
                            </Badge>
                            <Badge variant="outline">Source: {snapshot?.source || 'docker'}</Badge>
                        </div>
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Docker operations center</h2>
                            <p className="text-sm text-muted-foreground">
                                Live containers, images, storage, event feed, and CLI controls in one surface.
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Docker host
                            <select className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none" value={snapshot?.daemon.name || 'local-engine'} disabled>
                                <option>{snapshot?.daemon.name || 'local-engine'}</option>
                            </select>
                        </label>
                        <label className="flex min-h-[44px] flex-col justify-center rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Refresh
                            <select
                                className="mt-1 bg-transparent text-sm font-semibold text-foreground outline-none"
                                value={String(refreshMs)}
                                onChange={(event) => setRefreshMs(Number(event.target.value))}
                            >
                                <option value="2000">2 sec</option>
                                <option value="5000">5 sec</option>
                                <option value="10000">10 sec</option>
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => loadSnapshot().catch(() => undefined)}
                            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
                        >
                            <RefreshCcw className="h-4 w-4" />
                            Refresh now
                        </button>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-6">
                    <section className="grid gap-4 sm:grid-cols-3">
                        {stateSummary(snapshot).map(({ label, value, icon: Icon }) => (
                            <Card key={label} className="border-border/60 bg-card/80">
                                <CardContent className="flex min-h-[132px] items-center justify-between p-5">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                                        <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
                                        <Icon className="h-6 w-6 text-primary" />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </section>

                    <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                        <Card className="border-border/60" data-testid="docker-resource-chart">
                            <CardHeader>
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <CardTitle>Container resource usage</CardTitle>
                                        <p className="text-sm text-muted-foreground">CPU and memory percentages for the busiest containers.</p>
                                    </div>
                                    <Badge variant="outline">Top 5</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="h-[320px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={topContainers}>
                                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                                        <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                                        <Tooltip
                                            formatter={(value: number | string | undefined) => `${(typeof value === 'number' ? value : Number(value) || 0).toFixed(1)}%`}
                                            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                                        />
                                        <Legend />
                                        <Bar dataKey="cpuPercent" stackId="usage" fill="var(--primary)" radius={[6, 6, 0, 0]} name="CPU %" />
                                        <Bar dataKey="memoryPercent" stackId="usage" fill="var(--accent)" radius={[6, 6, 0, 0]} name="Memory %" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="border-border/60" data-testid="docker-disk-chart">
                            <CardHeader>
                                <CardTitle>Docker disk usage</CardTitle>
                                <p className="text-sm text-muted-foreground">Images, containers, volumes, and build cache footprint.</p>
                            </CardHeader>
                            <CardContent className="h-[320px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={diskChart} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}>
                                            {diskChart.map((entry, index) => (
                                                <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={tooltipBytes} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </section>

                    <section className="grid gap-6 2xl:grid-cols-2">
                        <Card className="border-border/60" data-testid="docker-io-chart">
                            <CardHeader>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <CardTitle>Container I/O</CardTitle>
                                        <p className="text-sm text-muted-foreground">Read and write activity for the selected container.</p>
                                    </div>
                                    <select
                                        value={selectedContainer?.id || ''}
                                        onChange={(event) => setSelectedContainerId(event.target.value)}
                                        className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm"
                                    >
                                        {snapshot?.containers.map((container) => (
                                            <option key={container.id} value={container.id}>{container.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={ioHistory}>
                                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="timestamp" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} minTickGap={22} />
                                        <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickFormatter={(value) => formatBytes(value)} />
                                        <Tooltip formatter={tooltipBytes} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }} />
                                        <Legend />
                                        <Line type="monotone" dataKey="read" stroke="var(--success)" dot={false} strokeWidth={2} name="Read/s" />
                                        <Line type="monotone" dataKey="write" stroke="var(--warning)" dot={false} strokeWidth={2} name="Write/s" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="border-border/60" data-testid="docker-network-chart">
                            <CardHeader>
                                <CardTitle>Network I/O by container</CardTitle>
                                <p className="text-sm text-muted-foreground">Top traffic containers across the recent polling window.</p>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={networkHistory}>
                                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="timestamp" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} minTickGap={20} />
                                        <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickFormatter={(value) => formatBytes(value)} />
                                        <Tooltip formatter={tooltipBytes} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)' }} />
                                        <Legend />
                                        {[0, 1, 2, 3].map((index) => (
                                            <Area key={index} type="monotone" dataKey={`c${index}`} stackId="1" stroke={chartColors[index]} fill={chartColors[index]} fillOpacity={0.2} name={String(networkHistory.at(-1)?.[`n${index}`] || `Container ${index + 1}`)} />
                                        ))}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </section>

                    <Card className="border-border/60" data-testid="docker-containers-table">
                        <CardHeader>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle>Containers</CardTitle>
                                    <p className="text-sm text-muted-foreground">Status badges, live resource usage, ports, networks, and one-click actions.</p>
                                </div>
                                <Badge variant="outline">{snapshot?.containers.length || 0} containers</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                    <tr>
                                        <th className="pb-3 pr-3">Container</th>
                                        <th className="pb-3 pr-3">Image</th>
                                        <th className="pb-3 pr-3">Status</th>
                                        <th className="pb-3 pr-3">Ports</th>
                                        <th className="pb-3 pr-3">Created</th>
                                        <th className="pb-3 pr-3">Networks</th>
                                        <th className="pb-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(snapshot?.containers || []).map((container) => {
                                        const expanded = expandedId === container.id;
                                        return (
                                            <Fragment key={container.id}>
                                                <tr className="border-t border-border/60 align-top">
                                                    <td className="py-3 pr-3">
                                                        <button
                                                            type="button"
                                                            className="flex min-h-[44px] items-center gap-2 text-left"
                                                            onClick={() => setExpandedId(expanded ? null : container.id)}
                                                        >
                                                            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                            <div>
                                                                <div className="font-semibold">{container.name}</div>
                                                                <div className="text-xs text-muted-foreground">{container.id.slice(0, 12)}</div>
                                                            </div>
                                                        </button>
                                                    </td>
                                                    <td className="py-3 pr-3">{container.image}</td>
                                                    <td className="py-3 pr-3">
                                                        <Badge variant={statusVariant(container.state)}>{container.state}</Badge>
                                                    </td>
                                                    <td className="py-3 pr-3 text-xs text-muted-foreground">{container.ports.join(', ') || 'n/a'}</td>
                                                    <td className="py-3 pr-3">{relativeTime(container.createdAt)}</td>
                                                    <td className="py-3 pr-3">{container.networks.join(', ') || 'n/a'}</td>
                                                    <td className="py-3">
                                                        <div className="flex flex-wrap gap-2">
                                                            <Button size="sm" variant="outline" disabled={pendingActionId === container.id || container.state === 'running'} onClick={() => runAction(container.id, 'start')}>
                                                                Start
                                                            </Button>
                                                            <Button size="sm" variant="outline" disabled={pendingActionId === container.id || container.state !== 'running'} onClick={() => runAction(container.id, 'stop')}>
                                                                Stop
                                                            </Button>
                                                            <Button size="sm" variant="outline" disabled={pendingActionId === container.id} onClick={() => runAction(container.id, 'restart')}>
                                                                Restart
                                                            </Button>
                                                            <Button size="sm" variant="ghost" onClick={() => { setSelectedContainerId(container.id); setTerminalCommand(`docker logs -f ${container.name}\n`); }}>
                                                                Logs
                                                            </Button>
                                                            <Button size="sm" variant="ghost" onClick={() => { setSelectedContainerId(container.id); setTerminalCommand(`docker exec -it ${container.name} sh\n`); }}>
                                                                Exec
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {expanded && (
                                                    <tr className="border-t border-border/40 bg-muted/15">
                                                        <td colSpan={7} className="p-4">
                                                            <div className="grid gap-4 lg:grid-cols-3">
                                                                <div className="space-y-2">
                                                                    <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live usage</h4>
                                                                    <div className="rounded-xl border border-border/60 bg-card p-3">
                                                                        <p>CPU: {container.cpuPercent.toFixed(1)}%</p>
                                                                        <p>Memory: {container.memoryPercent.toFixed(1)}%</p>
                                                                        <p>Memory usage: {formatBytes(container.memoryUsageBytes)} / {formatBytes(container.memoryLimitBytes)}</p>
                                                                        <p>Read: {formatBytes(container.blockReadBytes)}</p>
                                                                        <p>Write: {formatBytes(container.blockWriteBytes)}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ports, mounts, networks</h4>
                                                                    <div className="rounded-xl border border-border/60 bg-card p-3">
                                                                        <p className="font-medium">Ports</p>
                                                                        <p className="text-xs text-muted-foreground">{container.ports.join(', ') || 'No published ports'}</p>
                                                                        <p className="mt-3 font-medium">Networks</p>
                                                                        <p className="text-xs text-muted-foreground">{container.networks.join(', ') || 'No networks'}</p>
                                                                        <p className="mt-3 font-medium">Volumes</p>
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {container.mounts.length > 0 ? container.mounts.map((mount) => (
                                                                                <div key={`${mount.source}-${mount.destination}`}>{mount.source} {'->'} {mount.destination}</div>
                                                                            )) : 'No mounts'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Environment</h4>
                                                                    <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60 bg-card p-3 font-mono text-xs text-muted-foreground">
                                                                        {container.env.length > 0 ? container.env.map((entry) => <div key={entry}>{entry}</div>) : 'No environment variables reported'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60" data-testid="docker-assets">
                        <CardHeader>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle>Images, volumes, and networks</CardTitle>
                                    <p className="text-sm text-muted-foreground">Inventory views for registries, attached storage, and bridge topology.</p>
                                </div>
                                <DatasetTabs activeTab={activeTab} onChange={setActiveTab} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                tab={activeTab}
                                images={snapshot?.images || []}
                                volumes={snapshot?.volumes || []}
                                networks={snapshot?.networks || []}
                            />
                        </CardContent>
                    </Card>

                    <Card className="border-border/60" data-testid="docker-terminal">
                        <CardHeader>
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <CardTitle>Embedded Docker terminal</CardTitle>
                                    <p className="text-sm text-muted-foreground">Run `docker`, `docker-compose`, and `crictl` commands without leaving the module.</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setTerminalCommand('docker ps -a\n')}>
                                        Containers
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setTerminalCommand('docker images\n')}>
                                        Images
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setTerminalCommand('docker compose ps\n')}>
                                        Compose
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setTerminalCommand('crictl ps -a\n')}>
                                        CRI
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-2xl border border-border/60 bg-background/80">
                                <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
                                    <TerminalSquare className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-medium">Preset command</span>
                                    <code className="rounded bg-muted px-2 py-1 text-xs">{terminalCommand.trim()}</code>
                                </div>
                                <div className="h-[360px]">
                                    <TerminalUI sessionId={sessionId} initialCommand={terminalCommand} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <aside className="space-y-6">
                    <Card className="border-border/60" data-testid="docker-sidebar">
                        <CardHeader>
                            <CardTitle>Daemon profile</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="grid gap-3">
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Version</p>
                                    <p className="mt-1 font-semibold">{snapshot?.daemon.serverVersion || 'Unavailable'}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">API version</p>
                                    <p className="mt-1 font-semibold">{snapshot?.daemon.apiVersion || 'Unavailable'}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Storage driver</p>
                                    <p className="mt-1 font-semibold">{snapshot?.daemon.storageDriver || 'Unavailable'}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Disk summary</p>
                                    <p className="mt-1 font-semibold">{formatBytes(snapshot?.diskUsage.totalBytes || 0)}</p>
                                    <p className="text-xs text-muted-foreground">{snapshot?.diskUsage.usedPercent.toFixed(1) || '0.0'}% used</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60" data-testid="docker-alerts">
                        <CardHeader>
                            <div className="flex items-center justify-between gap-3">
                                <CardTitle>Alerts</CardTitle>
                                <Badge variant={(snapshot?.alerts.some((alert) => alert.severity === 'critical')) ? 'destructive' : 'outline'}>
                                    {snapshot?.alerts.length || 0}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {snapshot?.alerts.length ? snapshot.alerts.map((alert) => (
                                <div key={alert.id} className={cn(
                                    'rounded-xl border p-3',
                                    alert.severity === 'critical' ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/10',
                                )}>
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', alert.severity === 'critical' ? 'text-destructive' : 'text-warning')} />
                                        <div>
                                            <p className="font-medium">{alert.title}</p>
                                            <p className="text-xs text-muted-foreground">{alert.message}</p>
                                            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{alert.source} · {relativeTime(alert.lastSeenAt)}</p>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                                    No active Docker alerts.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-border/60" data-testid="docker-events">
                        <CardHeader>
                            <div className="flex items-center justify-between gap-3">
                                <CardTitle>Container events</CardTitle>
                                <Badge variant="outline">Live feed</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {snapshot?.events.length ? snapshot.events.map((event) => (
                                <div key={event.id} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className="rounded-lg border border-border/60 bg-background p-2">
                                                <Boxes className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <p className="font-medium">{event.actor}</p>
                                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{event.type} · {event.action}</p>
                                            </div>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{relativeTime(event.time)}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                                    No recent events.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {!snapshot?.daemonReachable && (
                        <Card className="border-destructive/40 bg-destructive/5">
                            <CardContent className="p-5">
                                <div className="flex items-start gap-3">
                                    <Database className="mt-0.5 h-5 w-5 text-destructive" />
                                    <div>
                                        <p className="font-semibold text-destructive">Docker socket access required</p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            This module expects `/var/run/docker.sock` access or membership in the Docker group. The UI remains available with mock/test data, but live actions need daemon permissions.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </aside>
            </div>
        </div>
    );
}
