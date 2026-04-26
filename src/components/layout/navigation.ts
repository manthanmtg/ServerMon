import {
  Activity,
  Bell,
  Bot,
  BookOpen,
  Brain,
  Cable,
  Clock,
  Cog,
  Container,
  Cpu,
  FolderTree,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Monitor,
  Package,
  Server,
  ServerCog,
  Settings,
  Shield,
  ShieldCheck,
  Terminal,
  Users as UsersIcon,
  Waypoints,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Fleet',
    items: [
      { label: 'Fleet', href: '/fleet', icon: ServerCog },
      { label: 'Hub Setup', href: '/fleet/setup', icon: Cog },
      { label: 'Endpoint Runner', href: '/fleet/endpoint-runner', icon: Zap },
      { label: 'Alerts', href: '/fleet/alerts', icon: Bell },
    ],
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
      { label: 'AI Runner', href: '/ai-runner', icon: Zap },
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
      { label: 'EnvVars', href: '/env-vars', icon: KeyRound },
    ],
  },
];

export const footerNavItems: NavItem[] = [
  { label: 'User Guide', href: '/guide', icon: BookOpen },
  { label: 'Settings', href: '/settings', icon: Settings },
];
