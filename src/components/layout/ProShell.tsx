'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/lib/ThemeContext';
import { useBrand } from '@/lib/BrandContext';
import ThemeSelector from './ThemeSelector';
import {
  LayoutDashboard,
  Terminal,
  Monitor,
  Activity,
  FolderTree,
  Settings,
  LogOut,
  Menu,
  X,
  HardDrive,
  Container,
  Cog,
  Bot,
  BookOpen,
  Package,
  Clock,
  Cable,
  Cpu,
  ShieldCheck,
  Server,
  Shield,
  Power,
  LoaderCircle,
  Brain,
  Users as UsersIcon,
  Waypoints,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import QuickAccessBar from '@/components/layout/QuickAccessBar';

interface ProShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  headerContent?: React.ReactNode;
}

const navGroups = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Modules',
    items: [
      { label: 'Terminal', href: '/terminal', icon: Terminal },
      { label: 'Processes', href: '/processes', icon: Monitor },
      { label: 'Audit Logs', href: '/logs', icon: Activity },
      { label: 'File Browser', href: '/file-browser', icon: FolderTree },
      { label: 'Disk', href: '/disk', icon: HardDrive },
      { label: 'Network', href: '/network', icon: Activity },
      { label: 'Updates', href: '/updates', icon: Package },
      { label: 'Docker', href: '/docker', icon: Container },
      { label: 'Services', href: '/services', icon: Cog },
      { label: 'AI Agents', href: '/ai-agents', icon: Bot },
      { label: 'Crons', href: '/crons', icon: Clock },
      { label: 'Ports', href: '/ports', icon: Cable },
      { label: 'Hardware', href: '/hardware', icon: Cpu },
      { label: 'Certificates', href: '/certificates', icon: ShieldCheck },
      { label: 'Nginx', href: '/nginx', icon: Server },
      { label: 'Security', href: '/security', icon: Shield },
      { label: 'Users & Permissions', href: '/users', icon: UsersIcon },
      { label: 'Memory', href: '/memory', icon: Brain },
      { label: 'Endpoints', href: '/endpoints', icon: Waypoints },
      { label: 'Self Service', href: '/self-service', icon: Zap },
    ],
  },
];

function SidebarNav({
  pathname,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const { settings } = useBrand();
  const navRef = React.useRef<HTMLElement>(null);

  // Restore scroll position
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const savedScroll = localStorage.getItem('sidebar-scroll');
      if (savedScroll && navRef.current) {
        navRef.current.scrollTop = parseInt(savedScroll, 10);
      }
    }
  }, []);

  // Save scroll position
  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem('sidebar-scroll', e.currentTarget.scrollTop.toString());
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center gap-2.5 px-5 border-b border-sidebar-border shrink-0">
        <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center">
          {settings.logoBase64 ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={settings.logoBase64} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-primary flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
        </div>
        <span className="text-sm font-bold text-foreground tracking-tight">
          {settings.pageTitle}
        </span>
      </div>

      <nav ref={navRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-4 px-3">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors min-h-[44px]',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-sidebar-foreground hover:bg-accent hover:text-foreground active:bg-accent'
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-0.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Link
          href="/guide"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors min-h-[44px]',
            pathname === '/guide'
              ? 'bg-primary text-primary-foreground'
              : 'text-sidebar-foreground hover:bg-accent hover:text-foreground active:bg-accent'
          )}
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          User Guide
        </Link>
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors min-h-[44px]',
            pathname === '/settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-sidebar-foreground hover:bg-accent hover:text-foreground active:bg-accent'
          )}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/10 transition-colors cursor-pointer min-h-[44px]"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Log out
        </button>
      </div>
    </div>
  );
}

export default function ProShell({ children, title, subtitle, headerContent }: ProShellProps) {
  useTheme();
  const pathname = usePathname();
  const { settings } = useBrand();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast } = useToast();
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const [isRebooting, setIsRebooting] = useState(false);

  // Update document title
  useEffect(() => {
    const originalTitle = document.title;
    if (settings.pageTitle) {
      document.title = `${title} | ${settings.pageTitle}`;
    }
    return () => {
      document.title = originalTitle;
    };
  }, [title, settings.pageTitle]);

  // Close sidebar on route change and lock body scroll when open
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  };

  const handleReboot = async () => {
    setShowRebootConfirm(false);
    setIsRebooting(true);
    try {
      const response = await fetch('/api/system/reboot', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to issue reboot command');

      toast({
        title: 'System Rebooting',
        description: data.message,
        variant: 'success',
      });
    } catch (error: unknown) {
      toast({
        title: 'Reboot Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setIsRebooting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-[232px] border-r border-sidebar-border bg-sidebar shrink-0 sticky top-0 h-screen">
        <SidebarNav pathname={pathname} onLogout={handleLogout} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-sidebar border-r border-sidebar-border shadow-xl animate-fade-in">
            <SidebarNav
              pathname={pathname}
              onNavigate={() => setSidebarOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 lg:px-6 border-b border-border bg-background sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
              {subtitle && (
                <>
                  <span className="text-muted-foreground/40 shrink-0">/</span>
                  <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                    {subtitle}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            {headerContent && (
              <div className="hidden xl:flex items-center gap-2 min-w-0 max-w-[32rem] overflow-x-auto">
                {headerContent}
              </div>
            )}

            <button
              onClick={() => setShowRebootConfirm(true)}
              disabled={isRebooting}
              className={cn(
                'flex items-center justify-center h-9 w-9 rounded-xl transition-all duration-300',
                'bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white hover:shadow-lg hover:shadow-destructive/20',
                'active:scale-95 disabled:opacity-50 disabled:grayscale disabled:pointer-events-none'
              )}
              title="Reboot System"
            >
              {isRebooting ? (
                <LoaderCircle className="w-4 h-4 animate-spin" />
              ) : (
                <Power className="w-4 h-4" />
              )}
            </button>

            <ThemeSelector />

            <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-border">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                A
              </div>
            </div>
          </div>
        </header>

        {/* Quick Access Bar */}
        {pathname === '/dashboard' && <QuickAccessBar />}

        {/* Content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      <ConfirmationModal
        isOpen={showRebootConfirm}
        onCancel={() => setShowRebootConfirm(false)}
        onConfirm={handleReboot}
        title="System Reboot"
        message="Are you sure you want to reboot the system? This will terminate all active processes and disconnect all sessions."
        verificationText="reboot"
        confirmLabel="Reboot Now"
        variant="danger"
        isLoading={isRebooting}
      />
    </div>
  );
}
