'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Theme, themes } from './themes';

interface ThemeContextType {
    theme: Theme;
    setTheme: (themeId: string) => void;
    availableThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialTheme(): Theme {
    if (typeof window !== 'undefined') {
        const savedId = localStorage.getItem('servermon-theme');
        if (savedId) {
            const found = themes.find((t) => t.id === savedId);
            if (found) return found;
        }
    }
    return themes[1]; // Obsidian (dark default)
}

function applyTheme(theme: Theme) {
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
        const cssVar = `--${key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;
        root.style.setProperty(cssVar, value as string);
    });
    root.setAttribute('data-theme', theme.type);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [currentTheme, setCurrentTheme] = useState<Theme>(getInitialTheme);

    useEffect(() => {
        applyTheme(currentTheme);
        localStorage.setItem('servermon-theme', currentTheme.id);
    }, [currentTheme]);

    const setTheme = useCallback((themeId: string) => {
        const found = themes.find((t) => t.id === themeId);
        if (found) setCurrentTheme(found);
    }, []);

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
