import React from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports for module widgets
// In a more advanced system, these would be registered by the modules themselves
const HealthWidget = dynamic(() => import('@/modules/health/ui/HealthWidget'), {
    loading: () => <div className="animate-pulse h-24 bg-gray-200 rounded-xl" />,
});

const widgetMap: Record<string, React.ComponentType<any>> = {
    HealthWidget,
};

export function renderWidget(componentName: string, props: any = {}) {
    const Component = widgetMap[componentName];
    if (!Component) {
        return (
            <div className="p-6 rounded-2xl border border-dashed border-red-300 bg-red-50 text-red-500 text-xs italic">
                Widget "{componentName}" not found.
            </div>
        );
    }
    return <Component {...props} />;
}
