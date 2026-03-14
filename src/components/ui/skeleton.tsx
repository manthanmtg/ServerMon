import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'circular';
}

function Skeleton({ className, variant = 'default', ...props }: SkeletonProps) {
    return (
        <div
            className={cn(
                'animate-pulse bg-muted',
                variant === 'circular' ? 'rounded-full' : 'rounded-lg',
                className,
            )}
            {...props}
        />
    );
}

function SkeletonCard() {
    return (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
        </div>
    );
}

function SkeletonChart() {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-5 space-y-1.5">
                <Skeleton className="h-4 w-28" />
            </div>
            <div className="px-5 pb-5">
                <Skeleton className="h-[280px] w-full" />
            </div>
        </div>
    );
}

function SkeletonTable({ rows = 4 }: { rows?: number }) {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4">
                <Skeleton className="h-8 w-full" />
            </div>
            <div className="divide-y divide-border">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-4">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Generic module page loading skeleton: stat cards row + content block. */
function PageSkeleton({ statCards = 4, showTable = true }: { statCards?: number; showTable?: boolean }) {
    return (
        <div className="space-y-6 animate-fade-in">
            <div className={statCards === 4 ? 'grid grid-cols-2 md:grid-cols-4 gap-4' : 'grid grid-cols-2 lg:grid-cols-4 gap-4'}>
                {Array.from({ length: statCards }).map((_, i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
            {showTable && <SkeletonTable rows={5} />}
        </div>
    );
}

/** Card with header + content skeleton for dashboard-style widgets. */
function WidgetCardSkeleton() {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 pb-2 flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
            </div>
            <div className="px-4 pb-4 space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
            </div>
        </div>
    );
}

export { Skeleton, SkeletonCard, SkeletonChart, SkeletonTable, PageSkeleton, WidgetCardSkeleton };
