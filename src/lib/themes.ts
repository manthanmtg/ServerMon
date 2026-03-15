export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  success: string;
  warning: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarBorder: string;
}

export interface Theme {
  id: string;
  name: string;
  type: 'light' | 'dark';
  colors: ThemeColors;
}

export const themes: Theme[] = [
  {
    id: 'light-default',
    name: 'Light',
    type: 'light',
    colors: {
      background: '#ffffff',
      foreground: '#0f172a',
      card: '#ffffff',
      cardForeground: '#0f172a',
      popover: '#ffffff',
      popoverForeground: '#0f172a',
      primary: '#4f46e5',
      primaryForeground: '#ffffff',
      secondary: '#f1f5f9',
      secondaryForeground: '#475569',
      muted: '#f1f5f9',
      mutedForeground: '#64748b',
      accent: '#f1f5f9',
      accentForeground: '#0f172a',
      destructive: '#ef4444',
      destructiveForeground: '#ffffff',
      border: '#e2e8f0',
      input: '#e2e8f0',
      ring: '#4f46e5',
      success: '#16a34a',
      warning: '#ca8a04',
      sidebar: '#f8fafc',
      sidebarForeground: '#64748b',
      sidebarBorder: '#e2e8f0',
    },
  },
  {
    id: 'dark-default',
    name: 'Obsidian',
    type: 'dark',
    colors: {
      background: '#020617',
      foreground: '#f8fafc',
      card: '#0f172a',
      cardForeground: '#f8fafc',
      popover: '#0f172a',
      popoverForeground: '#f8fafc',
      primary: '#6366f1',
      primaryForeground: '#ffffff',
      secondary: '#1e293b',
      secondaryForeground: '#cbd5e1',
      muted: '#1e293b',
      mutedForeground: '#94a3b8',
      accent: '#334155',
      accentForeground: '#f8fafc',
      destructive: '#ef4444',
      destructiveForeground: '#ffffff',
      border: '#1e293b',
      input: '#1e293b',
      ring: '#6366f1',
      success: '#22c55e',
      warning: '#eab308',
      sidebar: '#0f172a',
      sidebarForeground: '#94a3b8',
      sidebarBorder: '#1e293b',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    type: 'dark',
    colors: {
      background: '#272822',
      foreground: '#f8f8f2',
      card: '#1e1f1c',
      cardForeground: '#f8f8f2',
      popover: '#1e1f1c',
      popoverForeground: '#f8f8f2',
      primary: '#a6e22e',
      primaryForeground: '#272822',
      secondary: '#3e3d32',
      secondaryForeground: '#f8f8f2',
      muted: '#3e3d32',
      mutedForeground: '#75715e',
      accent: '#49483e',
      accentForeground: '#f8f8f2',
      destructive: '#f92672',
      destructiveForeground: '#f8f8f2',
      border: '#49483e',
      input: '#3e3d32',
      ring: '#a6e22e',
      success: '#a6e22e',
      warning: '#e6db74',
      sidebar: '#1e1f1c',
      sidebarForeground: '#75715e',
      sidebarBorder: '#3e3d32',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized',
    type: 'light',
    colors: {
      background: '#fdf6e3',
      foreground: '#657b83',
      card: '#eee8d5',
      cardForeground: '#657b83',
      popover: '#eee8d5',
      popoverForeground: '#657b83',
      primary: '#268bd2',
      primaryForeground: '#fdf6e3',
      secondary: '#eee8d5',
      secondaryForeground: '#657b83',
      muted: '#eee8d5',
      mutedForeground: '#93a1a1',
      accent: '#eee8d5',
      accentForeground: '#657b83',
      destructive: '#dc322f',
      destructiveForeground: '#fdf6e3',
      border: '#93a1a1',
      input: '#eee8d5',
      ring: '#268bd2',
      success: '#859900',
      warning: '#b58900',
      sidebar: '#eee8d5',
      sidebarForeground: '#93a1a1',
      sidebarBorder: '#93a1a1',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    type: 'dark',
    colors: {
      background: '#2e3440',
      foreground: '#eceff4',
      card: '#3b4252',
      cardForeground: '#eceff4',
      popover: '#3b4252',
      popoverForeground: '#eceff4',
      primary: '#88c0d0',
      primaryForeground: '#2e3440',
      secondary: '#434c5e',
      secondaryForeground: '#eceff4',
      muted: '#4c566a',
      mutedForeground: '#d8dee9',
      accent: '#434c5e',
      accentForeground: '#eceff4',
      destructive: '#bf616a',
      destructiveForeground: '#eceff4',
      border: '#4c566a',
      input: '#434c5e',
      ring: '#88c0d0',
      success: '#a3be8c',
      warning: '#ebcb8b',
      sidebar: '#2e3440',
      sidebarForeground: '#d8dee9',
      sidebarBorder: '#3b4252',
    },
  },
  {
    id: 'synthwave-84',
    name: 'Cyberpunk',
    type: 'dark',
    colors: {
      background: '#262335',
      foreground: '#ffffff',
      card: '#241b2f',
      cardForeground: '#ffffff',
      popover: '#241b2f',
      popoverForeground: '#ffffff',
      primary: '#ff7edb',
      primaryForeground: '#262335',
      secondary: '#36344d',
      secondaryForeground: '#ffffff',
      muted: '#36344d',
      mutedForeground: '#848bb2',
      accent: '#443f5b',
      accentForeground: '#ffffff',
      destructive: '#fe4450',
      destructiveForeground: '#ffffff',
      border: '#444352',
      input: '#36344d',
      ring: '#ff7edb',
      success: '#72f1b8',
      warning: '#fede5d',
      sidebar: '#1a1a2e',
      sidebarForeground: '#848bb2',
      sidebarBorder: '#36344d',
    },
  },
];
