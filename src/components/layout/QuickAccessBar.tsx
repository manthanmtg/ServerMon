'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Terminal,
  Monitor,
  Activity,
  Bell,
  FolderTree,
  Boxes,
  HardDrive,
  KeyRound,
  Package,
  Container,
  Cog,
  Bot,
  Clock,
  Cable,
  Cpu,
  ShieldCheck,
  Server,
  ServerCog,
  Shield,
  Brain,
  Waypoints,
  Settings,
  Users,
  Zap,
  AlertTriangle,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resilientFetch, safeJson } from '@/lib/fetch-utils';

export interface QuickAccessItem {
  id: string;
  href: string;
  label: string;
  icon: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  fleet: ServerCog,
  'fleet-setup': Cog,
  'fleet-endpoint-runner': Zap,
  'fleet-alerts': Bell,
  terminal: Terminal,
  processes: Monitor,
  logs: Activity,
  'file-browser': FolderTree,
  disk: HardDrive,
  network: Activity,
  updates: Package,
  docker: Container,
  services: Cog,
  'ai-agents': Bot,
  'ai-runner': Zap,
  crons: Clock,
  ports: Cable,
  hardware: Cpu,
  certificates: ShieldCheck,
  nginx: Server,
  security: Shield,
  users: Users,
  memory: Brain,
  endpoints: Waypoints,
  'self-service': Zap,
  apps: Boxes,
  'env-vars': KeyRound,
};

const MotionLink = motion.create(Link);

function isQuickAccessItem(value: unknown): value is QuickAccessItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.href === 'string' &&
    typeof item.label === 'string' &&
    typeof item.icon === 'string'
  );
}

function parseQuickAccessItems(data: unknown): QuickAccessItem[] {
  if (!isQuickAccessPayload(data)) return [];
  return data.items;
}

function isQuickAccessPayload(data: unknown): data is { items: QuickAccessItem[] } {
  if (!data || typeof data !== 'object') return false;
  const items = (data as { items?: unknown }).items;
  return Array.isArray(items) && items.every(isQuickAccessItem);
}

export default React.memo(function QuickAccessBar() {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<QuickAccessItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setIsRefreshing(true);

    try {
      const response = await resilientFetch('/api/settings/quick-access', { timeout: 5000 });
      if (!response.ok) throw new Error(`Quick Access responded with ${response.status}`);

      const data = await safeJson<unknown>(response);
      if (!isQuickAccessPayload(data)) throw new Error('Quick Access returned an invalid payload');

      if (sequence !== requestSequence.current) return;

      setItems(parseQuickAccessItems(data));
      setLoadFailed(false);
    } catch {
      if (sequence === requestSequence.current) setLoadFailed(true);
    } finally {
      if (sequence === requestSequence.current) {
        setLoaded(true);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  if (!loaded) return null;

  return (
    <nav
      aria-label="Quick Access"
      aria-busy={isRefreshing}
      className="animate-slide-down h-14 w-full bg-background/60 backdrop-blur-md border-b border-border/50 sticky top-14 z-30 flex items-center sm:h-12"
    >
      <div
        ref={scrollRef}
        className="flex items-center gap-1 px-3 lg:px-5 overflow-x-auto scrollbar-none h-full"
      >
        {loadFailed ? (
          <div
            role="alert"
            className="flex min-h-11 items-center gap-2 rounded-full border border-destructive/25 bg-destructive/5 px-3 text-xs text-foreground whitespace-nowrap"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
            <span>Quick Access is unavailable. Try again to load your pinned modules.</span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isRefreshing}
              aria-label="Retry Quick Access"
              className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-medium text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
                aria-hidden="true"
              />
              {isRefreshing ? 'Retrying' : 'Retry'}
            </button>
          </div>
        ) : items.length === 0 ? (
          <MotionLink
            href="/settings"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 250, damping: 18 }}
            className="flex items-center gap-1.5 px-3 h-11 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background whitespace-nowrap sm:h-8"
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span>Pin modules in Settings →</span>
          </MotionLink>
        ) : (
          items.map((item) => {
            const Icon = ICON_MAP[item.id] ?? LayoutDashboard;
            const isActive = pathname === item.href;
            return (
              <MotionLink
                key={item.id}
                href={item.href}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                transition={{ type: 'spring', stiffness: 250, damping: 18 }}
                className={cn(
                  'flex items-center gap-1.5 px-3 h-11 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap shrink-0 min-w-[44px] justify-center sm:h-8',
                  'hover:scale-[1.04] active:scale-[0.97]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
              </MotionLink>
            );
          })
        )}
      </div>
    </nav>
  );
});
