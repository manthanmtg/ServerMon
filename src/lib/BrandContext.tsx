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
