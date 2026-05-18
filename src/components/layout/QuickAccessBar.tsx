'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  if (!data || typeof data !== 'object') return [];
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.filter(isQuickAccessItem);
}

export default React.memo(function QuickAccessBar() {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<QuickAccessItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    resilientFetch('/api/settings/quick-access', { timeout: 5000 })
      .then((response) => safeJson<unknown>(response))
      .then((data) => {
        setItems(parseQuickAccessItems(data));
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  if (!loaded) return null;

  return (
    <nav
      aria-label="Quick Access"
      className="animate-slide-down h-14 w-full bg-background/60 backdrop-blur-md border-b border-border/50 sticky top-14 z-30 flex items-center sm:h-12"
    >
      <div
        ref={scrollRef}
        className="flex items-center gap-1 px-3 lg:px-5 overflow-x-auto scrollbar-none h-full"
      >
        {items.length === 0 ? (
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
