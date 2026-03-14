'use client';

import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { 
    AlertTriangle, 
    ArrowRight, 
    Box,
    Boxes,
    CheckCircle2, 
    Clock, 
    Cpu,
    History, 
    Info, 
    Package, 
    RefreshCcw, 
    RotateCcw, 
    ShieldAlert, 
    ShieldCheck,
    TerminalSquare,
    Zap
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { 
    Card, 
    CardContent, 
    CardDescription, 
    CardHeader, 
    CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { UpdateSnapshot } from '../types';

const TerminalUI = dynamic(() => import('@/modules/terminal/ui/TerminalUI'), { ssr: false });

export default function UpdatePage() {
    const [snapshot, setSnapshot] = useState<UpdateSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const { toast } = useToast();

    const loadSnapshot = React.useCallback(async (force: boolean = false) => {
        try {
            const res = await fetch('/api/modules/updates', {
                method: force ? 'POST' : 'GET',
                body: force ? JSON.stringify({ force: true }) : undefined,
                headers: force ? { 'Content-Type': 'application/json' } : undefined
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSnapshot(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast({
                title: 'Failed to fetch updates',
                description: message,
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
            setChecking(false);
        }
    }, [toast]);

    useEffect(() => {
        loadSnapshot();
    }, [loadSnapshot]);

    const handleCheckUpdates = () => {
        setChecking(true);
        loadSnapshot(true);
    };

    const historyData = useMemo(() => {
        if (!snapshot) return [];
        return [...snapshot.history].reverse().map(h => ({
            timestamp: new Date(h.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
            count: h.count,
            success: h.success ? 1 : 0
        }));
    }, [snapshot]);

    if (loading && !snapshot) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 animate-fade-in">
                <Spinner size="lg" />
                <p className="text-sm text-muted-foreground">Loading updates...</p>
            </div>
        );
    }

    const counts = snapshot?.counts || { security: 0, regular: 0, optional: 0, language: 0 };
    const totalUpdates = counts.security + counts.regular + counts.optional + counts.language;

    return (
        <div className="space-y-6 container mx-auto py-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/50 backdrop-blur-sm p-6 rounded-2xl border border-border/50">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/10 rounded-xl">
                            <Package className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">System Updates</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10">
                                    {snapshot?.osName} {snapshot?.osVersion}
                                </Badge>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Last checked: {snapshot ? new Date(snapshot.lastCheck).toLocaleString() : 'Never'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 h-10 px-4 rounded-xl hover:bg-primary/5 hover:text-primary transition-all active:scale-95"
                        onClick={handleCheckUpdates}
                        disabled={checking}
                    >
                        <RefreshCcw className={cn("w-4 h-4", checking && "animate-spin")} />
                        {checking ? 'Checking...' : 'Check for Updates'}
                    </Button>
                </div>
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden relative group transition-all hover:shadow-lg hover:shadow-destructive/5 hover:border-destructive/20">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-muted-foreground">Security Updates</p>
                                <p className="text-3xl font-bold tracking-tight text-destructive">{counts.security}</p>
                            </div>
                            <div className="p-3 bg-destructive/10 rounded-2xl group-hover:scale-110 transition-transform">
                                <ShieldAlert className="w-6 h-6 text-destructive" />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                            <Badge variant="outline" className="border-destructive/20 text-destructive text-[10px] uppercase font-bold tracking-widest px-2 py-0.5">
                                High Priority
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden relative group transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-muted-foreground">Regular Updates</p>
                                <p className="text-3xl font-bold tracking-tight text-primary">{counts.regular}</p>
                            </div>
                            <div className="p-3 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform">
                                <RotateCcw className="w-6 h-6 text-primary" />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                            <Badge variant="outline" className="border-primary/20 text-primary text-[10px] uppercase font-bold tracking-widest px-2 py-0.5">
                                Pending
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden relative group transition-all hover:shadow-lg hover:shadow-accent/5 hover:border-accent/20">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-muted-foreground">Package Managers</p>
                                <p className="text-3xl font-bold tracking-tight text-accent">{counts.language}</p>
                            </div>
                            <div className="p-3 bg-accent/10 rounded-2xl group-hover:scale-110 transition-transform">
                                <Info className="w-6 h-6 text-accent" />
                            </div>
                        </div>
                        <p className="mt-4 text-xs text-muted-foreground">NPM, PIP, etc.</p>
                    </CardContent>
                </Card>

                <Card className={cn(
                    "bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden relative group transition-all hover:shadow-lg",
                    snapshot?.pendingRestart 
                        ? "hover:shadow-warning/5 hover:border-warning/20" 
                        : "hover:shadow-success/5 hover:border-success/20"
                )}>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-muted-foreground">Reboot Required</p>
                                <p className={cn(
                                    "text-3xl font-bold tracking-tight",
                                    snapshot?.pendingRestart ? "text-warning" : "text-success"
                                )}>
                                    {snapshot?.pendingRestart ? 'Yes' : 'No'}
                                </p>
                            </div>
                            <div className={cn(
                                "p-3 rounded-2xl group-hover:scale-110 transition-transform",
                                snapshot?.pendingRestart ? "bg-warning/10" : "bg-success/10"
                            )}>
                                {snapshot?.pendingRestart ? (
                                    <AlertTriangle className="w-6 h-6 text-warning" />
                                ) : (
                                    <CheckCircle2 className="w-6 h-6 text-success" />
                                )}
                            </div>
                        </div>
                        {snapshot?.pendingRestart && (
                            <p className="mt-4 text-xs text-warning truncate">
                                Required by: {snapshot.restartRequiredBy[0] || 'Kernel update'}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Available Updates Table */}
                <Card className="lg:col-span-2 bg-card/20 backdrop-blur-xl border border-white/5 flex flex-col h-[600px] overflow-hidden shadow-2xl">
                    <CardHeader className="flex flex-row items-center justify-between px-6 py-5 border-b border-border/50 bg-white/5">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Boxes className="w-5 h-5 text-primary" />
                                <CardTitle className="text-xl font-bold tracking-tight">Available Updates</CardTitle>
                            </div>
                            <CardDescription className="text-xs">System and package updates ready for installation</CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                            <Badge className="bg-primary/20 text-primary border-primary/30 font-bold px-3 py-1">
                                {totalUpdates} Total
                            </Badge>
                            <Button 
                                size="sm" 
                                className="h-9 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95"
                                onClick={() => {
                                    toast({
                                        title: 'Starting updates...',
                                        description: 'Update process initiated in the package manager terminal.',
                                        variant: 'default',
                                    });
                                }}
                            >
                                <Zap className="w-4 h-4" />
                                Update All
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 overflow-auto bg-black/5">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-background/40 backdrop-blur-2xl border-b border-border/50 z-10">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Package Info</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 text-center">Version Journey</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">System</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 text-right">Severity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                {snapshot?.updates.map((update, i) => (
                                    <tr 
                                        key={i} 
                                        className="group hover:bg-primary/[0.03] transition-all duration-300"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 bg-muted/30 rounded-xl group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-300">
                                                    {update.manager === 'apt' ? (
                                                        <Cpu className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                                                    ) : (
                                                        <Box className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{update.name}</span>
                                                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium">{update.repository}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-6">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-tighter">From</span>
                                                    <code className="text-[11px] px-2 py-0.5 bg-muted/30 rounded text-muted-foreground font-mono">{update.currentVersion}</code>
                                                </div>
                                                <div className="relative flex items-center justify-center">
                                                    <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full animate-pulse group-hover:bg-primary/40 transition-all" />
                                                    <ArrowRight className="w-4 h-4 text-primary relative z-10 group-hover:translate-x-1 transition-transform" />
                                                </div>
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-[9px] font-black text-success/60 uppercase tracking-tighter">To</span>
                                                    <code className="text-[11px] px-2 py-0.5 bg-success/10 rounded border border-success/20 text-success font-mono font-bold">{update.newVersion}</code>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter bg-muted/20 border-border/50 py-0 h-5">
                                                    {update.manager}
                                                </Badge>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Badge 
                                                className={cn(
                                                    "text-[9px] uppercase font-black tracking-widest px-2 py-0.5 border-0 shadow-sm",
                                                    update.severity === 'critical' ? "bg-destructive text-destructive-foreground" :
                                                    update.severity === 'high' ? "bg-orange-500 text-white" :
                                                    update.severity === 'medium' ? "bg-warning text-warning-foreground" :
                                                    "bg-primary text-primary-foreground"
                                                )}
                                            >
                                                {update.severity}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                                {snapshot?.updates.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-24 text-center">
                                            <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-500">
                                                <div className="p-4 bg-success/10 rounded-full shadow-inner">
                                                    <ShieldCheck className="w-12 h-12 text-success" />
                                                </div>
                                                <div className="space-y-1">
                                                    <h3 className="text-xl font-bold bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">System is Secure</h3>
                                                    <p className="text-sm text-muted-foreground">All packages are running the latest versions.</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    {/* Update History Chart */}
                    <Card className="bg-card/30 backdrop-blur-md border border-border/50">
                        <CardHeader className="px-6 py-4">
                            <div className="flex items-center gap-2">
                                <History className="w-4 h-4 text-primary" />
                                <CardTitle className="text-base font-bold">Update Trends</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="px-2 pb-4">
                            <div className="h-[180px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={historyData}>
                                        <defs>
                                            <linearGradient id="installedGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis 
                                            dataKey="timestamp" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fontSize: 10, fill: 'gray' }}
                                        />
                                        <YAxis hide />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                                            itemStyle={{ fontSize: '10px' }}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="count" 
                                            stroke="var(--primary)" 
                                            fillOpacity={1} 
                                            fill="url(#installedGradient)" 
                                            name="Packages Updated"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Diagnostics Terminal Card */}
                    <Card className="bg-card/30 backdrop-blur-md border border-border/50 flex flex-col h-[350px]">
                        <CardHeader className="px-6 py-4 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-2">
                                <TerminalSquare className="w-4 h-4 text-primary" />
                                <CardTitle className="text-base font-bold">Package Manager</CardTitle>
                            </div>
                            <Badge variant="outline" className="text-[10px] uppercase border-primary/20 text-primary">Live</Badge>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-hidden">
                            <div className="h-full w-full bg-black/40">
                                <TerminalUI 
                                    sessionId="updates-diag"
                                    initialCommand="apt list --upgradable"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
