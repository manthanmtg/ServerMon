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
        name: 'Light Default',
        type: 'light',
        colors: {
            background: '#ffffff',
            foreground: '#0f172a',
            card: '#ffffff',
            cardForeground: '#0f172a',
            popover: '#ffffff',
            popoverForeground: '#0f172a',
            primary: '#2563eb',
            primaryForeground: '#ffffff',
            secondary: '#f1f5f9',
            secondaryForeground: '#0f172a',
            muted: '#f1f5f9',
            mutedForeground: '#64748b',
            accent: '#f1f5f9',
            accentForeground: '#0f172a',
            destructive: '#ef4444',
            destructiveForeground: '#ffffff',
            border: '#e2e8f0',
            input: '#e2e8f0',
            ring: '#2563eb',
        },
    },
    {
        id: 'dark-default',
        name: 'Obsidian Pro',
        type: 'dark',
        colors: {
            background: '#020617',
            foreground: '#f8fafc',
            card: '#0f172a', /* Slightly lighter for glass layering */
            cardForeground: '#f8fafc',
            popover: '#0f172a',
            popoverForeground: '#f8fafc',
            primary: '#6366f1', /* Indigo vibrant */
            primaryForeground: '#ffffff',
            secondary: '#1e293b',
            secondaryForeground: '#f8fafc',
            muted: '#1e293b',
            mutedForeground: '#94a3b8',
            accent: '#ec4899', /* Radiant Rose */
            accentForeground: '#ffffff',
            destructive: '#ef4444',
            destructiveForeground: '#ffffff',
            border: '#1e293b',
            input: '#1e293b',
            ring: '#6366f1',
        },
    },
    {
        id: 'monokai',
        name: 'Monokai',
        type: 'dark',
        colors: {
            background: '#272822',
            foreground: '#f8f8f2',
            card: '#272822',
            cardForeground: '#f8f8f2',
            popover: '#272822',
            popoverForeground: '#f8f8f2',
            primary: '#a6e22e',
            primaryForeground: '#272822',
            secondary: '#3e3d32',
            secondaryForeground: '#f8f8f2',
            muted: '#3e3d32',
            mutedForeground: '#75715e',
            accent: '#f92672',
            accentForeground: '#f8f8f2',
            destructive: '#f92672',
            destructiveForeground: '#f8f8f2',
            border: '#49483e',
            input: '#49483e',
            ring: '#a6e22e',
        },
    },
    {
        id: 'solarized-light',
        name: 'Solarized Light',
        type: 'light',
        colors: {
            background: '#fdf6e3',
            foreground: '#657b83',
            card: '#eee8d5',
            cardForeground: '#657b83',
            popover: '#fdf6e3',
            popoverForeground: '#657b83',
            primary: '#268bd2',
            primaryForeground: '#fdf6e3',
            secondary: '#eee8d5',
            secondaryForeground: '#657b83',
            muted: '#eee8d5',
            mutedForeground: '#93a1a1',
            accent: '#d33682',
            accentForeground: '#fdf6e3',
            destructive: '#dc322f',
            destructiveForeground: '#fdf6e3',
            border: '#93a1a1',
            input: '#eee8d5',
            ring: '#268bd2',
        },
    },
    {
        id: 'nord',
        name: 'Nord Deep',
        type: 'dark',
        colors: {
            background: '#2e3440',
            foreground: '#eceff4',
            card: '#3b4252',
            cardForeground: '#eceff4',
            popover: '#2e3440',
            popoverForeground: '#eceff4',
            primary: '#88c0d0',
            primaryForeground: '#2e3440',
            secondary: '#434c5e',
            secondaryForeground: '#eceff4',
            muted: '#4c566a',
            mutedForeground: '#d8dee9',
            accent: '#81a1c1',
            accentForeground: '#2e3440',
            destructive: '#bf616a',
            destructiveForeground: '#eceff4',
            border: '#4c566a',
            input: '#4c566a',
            ring: '#88c0d0',
        },
    },
    {
        id: 'synthwave-84',
        name: 'Cyberpunk 84',
        type: 'dark',
        colors: {
            background: '#262335',
            foreground: '#ffffff',
            card: '#241b2f',
            cardForeground: '#ffffff',
            popover: '#262335',
            popoverForeground: '#ffffff',
            primary: '#ff7edb',
            primaryForeground: '#262335',
            secondary: '#36344d',
            secondaryForeground: '#ffffff',
            muted: '#36344d',
            mutedForeground: '#848bb2',
            accent: '#f97e72',
            accentForeground: '#262335',
            destructive: '#fe4450',
            destructiveForeground: '#ffffff',
            border: '#444352',
            input: '#36344d',
            ring: '#ff7edb',
        },
    },
];
