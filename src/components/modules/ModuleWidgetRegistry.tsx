import React from 'react';
import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/spinner';
import { WidgetErrorBoundary } from '@/components/ui/error-boundary';

function WidgetLoader() {
    return (
        <div className="flex items-center justify-center py-12">
            <Spinner />
        </div>
    );
}

const HealthWidget = dynamic(() => import('@/modules/health/ui/HealthWidget'), {
    loading: WidgetLoader,
});

const ProcessWidget = dynamic(() => import('@/modules/processes/ui/ProcessWidget'), {
    loading: WidgetLoader,
});

const LogsWidget = dynamic(() => import('@/modules/logs/ui/LogsWidget'), {
    loading: WidgetLoader,
});

const CPUChartWidget = dynamic(() => import('@/modules/metrics/ui/CPUChartWidget'), {
    loading: WidgetLoader,
});

const MemoryChartWidget = dynamic(() => import('@/modules/metrics/ui/MemoryChartWidget'), {
    loading: WidgetLoader,
});

const DiskWidget = dynamic(() => import('@/modules/disk/ui/DiskWidget'), {
    loading: WidgetLoader,
});

const ServicesWidget = dynamic(() => import('@/modules/services/ui/ServicesWidget'), {
    loading: WidgetLoader,
});

const AIAgentsWidget = dynamic(() => import('@/modules/ai-agents/ui/AIAgentsWidget'), {
    loading: WidgetLoader,
});

const NetworkWidget = dynamic(() => import('@/modules/network/ui/NetworkWidget'), {
    loading: WidgetLoader,
});

const widgetMap: Record<string, { component: React.ComponentType<Record<string, unknown>>; name: string }> = {
    HealthWidget: { component: HealthWidget, name: 'System Health' },
    ProcessWidget: { component: ProcessWidget, name: 'Processes' },
    LogsWidget: { component: LogsWidget, name: 'Activity Log' },
    CPUChartWidget: { component: CPUChartWidget, name: 'CPU Chart' },
    MemoryChartWidget: { component: MemoryChartWidget, name: 'Memory Chart' },
    DiskWidget: { component: DiskWidget, name: 'Disk Usage' },
    ServicesWidget: { component: ServicesWidget, name: 'Services' },
    AIAgentsWidget: { component: AIAgentsWidget, name: 'AI Agents' },
    NetworkWidget: { component: NetworkWidget, name: 'Network Usage' },
};

export function renderWidget(componentName: string, props: Record<string, unknown> = {}) {
    const entry = widgetMap[componentName];
    if (!entry) {
        return (
            <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-sm">
                Widget &quot;{componentName}&quot; not found
            </div>
        );
    }
    const { component: Component, name } = entry;
    return (
        <WidgetErrorBoundary name={name}>
            <Component {...props} />
        </WidgetErrorBoundary>
    );
}
