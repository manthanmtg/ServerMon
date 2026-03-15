'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  Search,
  ChevronRight,
  Info,
  Compass,
  Terminal,
  Activity,
  FolderTree,
  HardDrive,
  Container,
  LayoutDashboard,
  Package,
  Cog,
  Bot,
  Clock,
  Cable,
  Cpu,
  ShieldCheck,
  Server,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { moduleGuides } from '@/modules/guide-registry';
import { LucideIcon } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  Info,
  Compass,
  Terminal,
  Activity,
  FolderTree,
  HardDrive,
  Container,
  LayoutDashboard,
  Clock,
  Package,
  Cog,
  Bot,
  Cable,
  Cpu,
  ShieldCheck,
  Server,
  Shield,
};

const sidebarIconByModuleId: Record<string, LucideIcon> = {
  guide: BookOpen,
  dashboard: LayoutDashboard,
  terminal: Terminal,
  processes: Activity,
  logs: Activity,
  'file-browser': FolderTree,
  disk: HardDrive,
  network: Activity,
  updates: Package,
  docker: Container,
  services: Cog,
  'ai-agents': Bot,
  crons: Clock,
  ports: Cable,
  hardware: Cpu,
  certificates: ShieldCheck,
  nginx: Server,
  security: Shield,
};

export default function UserGuidePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(
    moduleGuides[0]?.id || null
  );

  const selectedModule = moduleGuides.find((m) => m.id === selectedModuleId);

  const filteredModules = moduleGuides.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.guide.sections.some((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Header Section */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-primary" />
          Knowledge Center
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Everything you need to know about monitoring and managing your infrastructure with
          ServerMon.
        </p>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        {/* Sidebar Navigation */}
        <aside className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search guides..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-secondary/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
            />
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-3 mb-2">
              Modules
            </p>
            {filteredModules.map((module) => (
              <button
                key={module.id}
                onClick={() => setSelectedModuleId(module.id)}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group',
                  selectedModuleId === module.id
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="flex items-center gap-3">
                  {(() => {
                    const Icon = sidebarIconByModuleId[module.id] ?? BookOpen;
                    return <Icon className="w-4 h-4" />;
                  })()}
                  {module.name}
                </span>
                <ChevronRight
                  className={cn(
                    'w-4 h-4 transition-transform',
                    selectedModuleId === module.id ? 'rotate-90' : 'group-hover:translate-x-0.5'
                  )}
                />
              </button>
            ))}
          </div>
        </aside>

        {/* Guide Content */}
        <main className="min-w-0">
          {selectedModule && selectedModule.guide ? (
            <div className="flex flex-col gap-8">
              <div className="p-8 rounded-3xl bg-secondary/30 border border-border/50 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 -mr-8 -mt-8 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
                <div className="relative flex flex-col gap-4">
                  <h1 className="text-4xl font-extrabold tracking-tight">
                    {selectedModule.guide.title}
                  </h1>
                  <p className="text-xl text-muted-foreground leading-relaxed max-w-3xl">
                    {selectedModule.guide.description}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedModule.guide.sections.map((section, idx) => {
                  const IconComponent = iconMap[section.icon || 'Info'] || Info;
                  return (
                    <div
                      key={idx}
                      className="p-6 rounded-2xl border border-border bg-card hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 flex flex-col gap-4 group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <IconComponent className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <h3 className="text-lg font-bold">{section.title}</h3>
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {section.content}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-[400px] rounded-3xl border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground gap-4">
              <BookOpen className="w-12 h-12 opacity-20" />
              <p className="font-medium text-lg">Select a module to view its guide</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
