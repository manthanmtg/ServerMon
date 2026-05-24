import { AlertTriangle, Cog, Search, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewTab = 'services' | 'timers' | 'alerts';

type ServicesViewTabsProps = {
  alertsCount: number;
  search: string;
  selectedTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onSearchChange: (search: string) => void;
};

export function ServicesViewTabs({
  alertsCount,
  search,
  selectedTab,
  onTabChange,
  onSearchChange,
}: ServicesViewTabsProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1">
        {(['services', 'timers', 'alerts'] as ViewTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={cn(
              'min-h-[44px] rounded-lg px-4 text-xs font-semibold uppercase tracking-[0.18em] transition-colors flex items-center gap-2',
              selectedTab === tab
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'services' && <Cog className="w-3.5 h-3.5" />}
            {tab === 'timers' && <Timer className="w-3.5 h-3.5" />}
            {tab === 'alerts' && <AlertTriangle className="w-3.5 h-3.5" />}
            {tab}
            {tab === 'alerts' && alertsCount > 0 && (
              <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                {alertsCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {selectedTab === 'services' && (
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search services..."
            value={search}
            aria-label="Search services"
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      )}
    </div>
  );
}
