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

export { Skeleton, SkeletonCard, SkeletonChart, SkeletonTable };
