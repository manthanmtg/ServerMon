'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Terminal,
  Monitor,
  Activity,
  Bell,
  FolderTree,
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
  'env-vars': KeyRound,
};

export default function QuickAccessBar() {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<QuickAccessItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings/quick-access')
      .then((r) => r.json())
      .then((data: { items?: QuickAccessItem[] }) => {
        setItems(data.items ?? []);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  if (!loaded) return null;

  return (
    <div className="animate-slide-down h-12 w-full bg-background/60 backdrop-blur-md border-b border-border/50 sticky top-14 z-30 flex items-center">
      <div
        ref={scrollRef}
        className="flex items-center gap-1 px-3 lg:px-5 overflow-x-auto scrollbar-none h-full"
      >
        {items.length === 0 ? (
          <Link
            href="/settings"
            className="flex items-center gap-1.5 px-3 h-8 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-all whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span>Pin modules in Settings →</span>
          </Link>
        ) : (
          items.map((item) => {
            const Icon = ICON_MAP[item.id] ?? LayoutDashboard;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap shrink-0 min-w-[44px] justify-center',
                  'hover:scale-[1.04] active:scale-[0.97]',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
                title={item.label}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
