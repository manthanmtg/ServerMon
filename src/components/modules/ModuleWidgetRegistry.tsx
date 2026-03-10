import React from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports for module widgets
// In a more advanced system, these would be registered by the modules themselves
const HealthWidget = dynamic(() => import('@/modules/health/ui/HealthWidget'), {
    loading: () => <div className="animate-pulse h-24 bg-gray-200 rounded-xl" />,
});

const ProcessWidget = dynamic(() => import('@/modules/processes/ui/ProcessWidget'), {
    loading: () => <div className="animate-pulse h-64 bg-gray-200 rounded-xl opacity-20" />,
});

const LogsWidget = dynamic(() => import('@/modules/logs/ui/LogsWidget'), {
    loading: () => <div className="animate-pulse h-48 bg-gray-200 rounded-xl opacity-20" />,
});

const CPUChartWidget = dynamic(() => import('@/modules/metrics/ui/CPUChartWidget'), {
    loading: () => <div className="animate-pulse h-[300px] bg-gray-200 rounded-xl opacity-20" />,
});

const MemoryChartWidget = dynamic(() => import('@/modules/metrics/ui/MemoryChartWidget'), {
    loading: () => <div className="animate-pulse h-[300px] bg-gray-200 rounded-xl opacity-20" />,
});

const widgetMap: Record<string, React.ComponentType<any>> = {
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
            <div className="p-6 rounded-2xl border border-dashed border-red-300 bg-red-50 text-red-500 text-xs italic">
                Widget &quot;{componentName}&quot; not found.
            </div>
        );
    }
    return <Component {...props} />;
}
