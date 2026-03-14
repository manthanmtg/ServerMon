'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface BrandSettings {
    pageTitle: string;
    logoBase64: string;
}

interface BrandContextType {
    settings: BrandSettings;
    updateSettings: (newSettings: BrandSettings) => Promise<void>;
}

const defaultSettings: BrandSettings = {
    pageTitle: 'ServerMon',
    logoBase64: '',
};

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<BrandSettings>(defaultSettings);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/settings/branding');
            if (res.ok) {
                const data = await res.json();
                setSettings({
                    pageTitle: data.pageTitle || 'ServerMon',
                    logoBase64: data.logoBase64 || '',
                });
            }
        } catch (err) {
            console.error('Failed to fetch branding settings', err);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Update favicon and document title dynamically
    useEffect(() => {
        if (typeof document === 'undefined') return;

        // Update Title - fallback if components don't update it
        if (settings.pageTitle && !document.title.includes(settings.pageTitle)) {
            // Only update if it doesn't already contain the title (to avoid overwriting page-specific titles)
            if (document.title === 'ServerMon' || document.title === '') {
                document.title = settings.pageTitle;
            }
        }

        // Update Favicon
        if (settings.logoBase64) {
            const updateIcon = (selector: string) => {
                let link = document.querySelector(selector) as HTMLLinkElement;
                if (!link) {
                    link = document.createElement('link');
                    link.rel = selector.includes('apple') ? 'apple-touch-icon' : 'icon';
                    document.head.appendChild(link);
                }
                link.href = settings.logoBase64;
            };

            updateIcon('link[rel*="icon"]');
            updateIcon('link[rel="apple-touch-icon"]');
        }
    }, [settings.logoBase64, settings.pageTitle]);

    const updateSettings = async (newSettings: BrandSettings) => {
        try {
            const res = await fetch('/api/settings/branding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings),
            });
            if (res.ok) {
                setSettings(newSettings);
            } else {
                throw new Error('Failed to update settings');
            }
        } catch (err) {
            console.error('Failed to update branding settings', err);
            throw err;
        }
    };

    return (
        <BrandContext.Provider value={{ settings, updateSettings }}>
            {children}
        </BrandContext.Provider>
    );
}

export function useBrand() {
    const context = useContext(BrandContext);
    if (context === undefined) {
        throw new Error('useBrand must be used within a BrandProvider');
    }
    return context;
}
