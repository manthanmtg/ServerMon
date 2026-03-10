'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Theme, themes } from './themes';

interface ThemeContextType {
    theme: Theme;
    setTheme: (themeId: string) => void;
    availableThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [currentTheme, setCurrentTheme] = useState<Theme>(themes[0]); // Light default

    useEffect(() => {
        // Load saved theme from localStorage
        const savedThemeId = localStorage.getItem('servermon-theme');
        if (savedThemeId) {
            const found = themes.find((t) => t.id === savedThemeId);
            if (found) setCurrentTheme(found);
        }
    }, []);

    useEffect(() => {
        // Apply theme colors to CSS variables
        const root = document.documentElement;
        const { colors } = currentTheme;

        Object.entries(colors).forEach(([key, value]) => {
            // Convert camelCase to kebab-case (e.g., primaryForeground -> --primary-foreground)
            const cssVarName = `--${key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;
            root.style.setProperty(cssVarName, value as string);
        });

        // Save theme preference
        localStorage.setItem('servermon-theme', currentTheme.id);
    }, [currentTheme]);

    const setTheme = (themeId: string) => {
        const found = themes.find((t) => t.id === themeId);
        if (found) setCurrentTheme(found);
    };

    return (
        <ThemeContext.Provider value={{ theme: currentTheme, setTheme, availableThemes: themes }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
