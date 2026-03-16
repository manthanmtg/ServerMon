'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Terminal,
  Monitor,
  Activity,
  FolderTree,
  HardDrive,
  Package,
  Container,
  Cog,
  Bot,
  Clock,
  Cable,
  Cpu,
  ShieldCheck,
  Server,
  Shield,
  Brain,
  Waypoints,
  GripVertical,
  Zap,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { type QuickAccessItem } from '@/components/layout/QuickAccessBar';

interface ModuleDef {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  iconKey: string;
}

const ALL_MODULES: ModuleDef[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, iconKey: 'LayoutDashboard' },
  { id: 'terminal', label: 'Terminal', href: '/terminal', icon: Terminal, iconKey: 'Terminal' },
  { id: 'processes', label: 'Processes', href: '/processes', icon: Monitor, iconKey: 'Monitor' },
  { id: 'logs', label: 'Audit Logs', href: '/logs', icon: Activity, iconKey: 'Activity' },
  { id: 'file-browser', label: 'File Browser', href: '/file-browser', icon: FolderTree, iconKey: 'FolderTree' },
  { id: 'disk', label: 'Disk', href: '/disk', icon: HardDrive, iconKey: 'HardDrive' },
  { id: 'network', label: 'Network', href: '/network', icon: Activity, iconKey: 'Activity' },
  { id: 'updates', label: 'Updates', href: '/updates', icon: Package, iconKey: 'Package' },
  { id: 'docker', label: 'Docker', href: '/docker', icon: Container, iconKey: 'Container' },
  { id: 'services', label: 'Services', href: '/services', icon: Cog, iconKey: 'Cog' },
  { id: 'ai-agents', label: 'AI Agents', href: '/ai-agents', icon: Bot, iconKey: 'Bot' },
  { id: 'crons', label: 'Crons', href: '/crons', icon: Clock, iconKey: 'Clock' },
  { id: 'ports', label: 'Ports', href: '/ports', icon: Cable, iconKey: 'Cable' },
  { id: 'hardware', label: 'Hardware', href: '/hardware', icon: Cpu, iconKey: 'Cpu' },
  { id: 'certificates', label: 'Certificates', href: '/certificates', icon: ShieldCheck, iconKey: 'ShieldCheck' },
  { id: 'nginx', label: 'Nginx', href: '/nginx', icon: Server, iconKey: 'Server' },
  { id: 'security', label: 'Security', href: '/security', icon: Shield, iconKey: 'Shield' },
  { id: 'users', label: 'Users & Permissions', href: '/users', icon: Users, iconKey: 'Users' },
  { id: 'memory', label: 'Memory', href: '/memory', icon: Brain, iconKey: 'Brain' },
  { id: 'endpoints', label: 'Endpoints', href: '/endpoints', icon: Waypoints, iconKey: 'Waypoints' },
];

export { ALL_MODULES };

export default function QuickAccessSettings() {
  const { toast } = useToast();
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Drag-to-reorder state
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    fetch('/api/settings/quick-access')
      .then((r) => r.json())
      .then((data: { items?: QuickAccessItem[] }) => {
        setEnabledIds((data.items ?? []).map((i) => i.id));
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const enabledModules = enabledIds
    .map((id) => ALL_MODULES.find((m) => m.id === id))
    .filter((m): m is ModuleDef => m !== undefined);

  const disabledModules = ALL_MODULES.filter((m) => !enabledIds.includes(m.id));

  const toggleModule = useCallback((id: string, enabled: boolean) => {
    setEnabledIds((prev) => {
      if (enabled) return [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  const handleDragStart = (index: number) => {
    dragIndex.current = index;
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const src = dragIndex.current;
    if (src === null || src === targetIndex) return;
    setEnabledIds((prev) => {
      const next = [...prev];
      const [removed] = next.splice(src, 1);
      next.splice(targetIndex, 0, removed);
      return next;
    });
    dragIndex.current = targetIndex;
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const items: QuickAccessItem[] = enabledIds
        .map((id) => {
          const mod = ALL_MODULES.find((m) => m.id === id);
          if (!mod) return null;
          return { id: mod.id, href: mod.href, label: mod.label, icon: mod.iconKey };
        })
        .filter((x): x is QuickAccessItem => x !== null);

      const res = await fetch('/api/settings/quick-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to save');
      }

      toast({ title: 'Quick Access Saved', description: 'Bar updated successfully.', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Quick Access</CardTitle>
            <CardDescription>Pin module shortcuts to the sticky top bar</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Live preview */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
          <div className="h-12 rounded-xl bg-background/60 backdrop-blur-md border border-border/50 flex items-center px-3 gap-1 overflow-x-auto scrollbar-none">
            {enabledModules.length === 0 ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Settings className="w-3.5 h-3.5 shrink-0" />
                Pin modules in Settings →
              </span>
            ) : (
              enabledModules.map((mod) => (
                <span
                  key={mod.id}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium bg-accent text-foreground whitespace-nowrap shrink-0"
                >
                  <mod.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{mod.label}</span>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Enabled list (draggable) */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {enabledModules.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Pinned — drag to reorder
                </p>
                <div className="space-y-1">
                  {enabledModules.map((mod, idx) => (
                    <div
                      key={mod.id}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20 cursor-grab active:cursor-grabbing min-h-[44px] group"
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
                      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <mod.icon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-foreground">{mod.label}</span>
                      <button
                        onClick={() => toggleModule(mod.id, false)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded min-h-[44px]"
                        aria-label={`Remove ${mod.label}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {disabledModules.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Available — click to pin
                </p>
                <div className="space-y-1">
                  {disabledModules.map((mod) => (
                    <div
                      key={mod.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors min-h-[44px]"
                    >
                      <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                        <mod.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <span className="flex-1 text-sm text-muted-foreground">{mod.label}</span>
                      <button
                        onClick={() => toggleModule(mod.id, true)}
                        className="text-xs text-primary hover:text-primary/80 font-medium transition-colors px-2 py-1 rounded min-h-[44px]"
                        aria-label={`Pin ${mod.label}`}
                      >
                        Pin
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full h-11 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
              Saving…
            </>
          ) : (
            'Save Quick Access'
          )}
        </button>

        <p className="text-xs text-muted-foreground text-center">
          Changes take effect immediately.{' '}
          <Link href="/settings" className="text-primary hover:underline">
            Manage all settings
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
