'use client';

import React from 'react';
import { Cpu, MemoryStick, Clock, Activity as ActivityIcon } from 'lucide-react';
import ProShell from '@/components/layout/ProShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { renderWidget } from '@/components/modules/ModuleWidgetRegistry';
import { MetricsProvider, useMetrics } from '@/lib/MetricsContext';

function DashboardContent() {
    const { latest, history, connected } = useMetrics();

    return (
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatCard
                    label="CPU"
                    value={latest ? `${latest.cpu.toFixed(1)}%` : '--'}
                    icon={<Cpu className="w-4 h-4" />}
                    status={!latest ? 'loading' : latest.cpu > 80 ? 'warning' : 'normal'}
                />
                <StatCard
                    label="Memory"
                    value={latest ? `${latest.memory.toFixed(1)}%` : '--'}
                    icon={<MemoryStick className="w-4 h-4" />}
                    status={!latest ? 'loading' : latest.memory > 80 ? 'warning' : 'normal'}
                />
                <StatCard
                    label="Samples"
                    value={history.length > 0 ? `${history.length}` : '--'}
                    icon={<ActivityIcon className="w-4 h-4" />}
                    status={!connected ? 'loading' : 'normal'}
                />
                <StatCard
                    label="Stream"
                    value={connected ? 'Live' : 'Connecting'}
                    icon={<Clock className="w-4 h-4" />}
                    status={connected ? 'normal' : 'loading'}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                <Card className="lg:col-span-2">
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle>CPU Usage</CardTitle>
                        <Badge variant={connected ? 'success' : 'secondary'}>
                            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                            {connected ? 'Live' : 'Offline'}
                        </Badge>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px] sm:h-[280px]">
                            {renderWidget('CPUChartWidget', { externalData: history })}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Memory Usage</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px] sm:h-[280px]">
                            {renderWidget('MemoryChartWidget', { externalData: history })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {renderWidget('LogsWidget')}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>System Health</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {renderWidget('HealthWidget')}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <ProShell title="Dashboard" subtitle="Overview">
            <MetricsProvider>
                <DashboardContent />
            </MetricsProvider>
        </ProShell>
    );
}

function StatCard({ label, value, icon, status }: {
    label: string;
    value: string;
    icon: React.ReactNode;
    status: 'normal' | 'warning' | 'loading';
}) {
    return (
        <Card>
            <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <span className="text-xs sm:text-sm text-muted-foreground">{label}</span>
                    <span className={status === 'warning' ? 'text-warning' : 'text-muted-foreground'}>
                        {status === 'loading' ? <Spinner size="sm" /> : icon}
                    </span>
                </div>
                <p className={`text-xl sm:text-2xl font-semibold tracking-tight ${
                    status === 'warning' ? 'text-warning' : 'text-foreground'
                }`}>
                    {value}
                </p>
            </CardContent>
        </Card>
    );
}
