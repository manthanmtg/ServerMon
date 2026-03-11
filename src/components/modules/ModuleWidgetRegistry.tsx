import React from 'react';
import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/spinner';

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

const widgetMap: Record<string, React.ComponentType<Record<string, unknown>>> = {
    HealthWidget,
    ProcessWidget,
    LogsWidget,
    CPUChartWidget,
    MemoryChartWidget,
};

export function renderWidget(componentName: string, props: Record<string, unknown> = {}) {
    const Component = widgetMap[componentName];
    if (!Component) {
        return (
            <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-sm">
                Widget &quot;{componentName}&quot; not found
            </div>
        );
    }
    return <Component {...props} />;
}
