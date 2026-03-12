'use client';

import React, { useState } from 'react';
import { Settings2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export interface DiskSettings {
    unitSystem: 'binary' | 'decimal';
}

interface Props {
    settings: DiskSettings;
    onClose: () => void;
    onSaved: (next: DiskSettings) => void;
}

export default function DiskSettingsModal({ settings, onClose, onSaved }: Props) {
    const [localSettings, setLocalSettings] = useState<DiskSettings>(settings);
    const [saving, setSaving] = useState(false);

    const handleSave = async (unitSystem: 'binary' | 'decimal') => {
        const next = { ...localSettings, unitSystem };
        setLocalSettings(next);
        setSaving(true);
        try {
            const res = await fetch('/api/modules/disk/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next),
            });
            const data = await res.json();
            if (data.settings) {
                onSaved(data.settings);
            }
        } catch (err) {
            console.error('Failed to save disk settings:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-md shadow-2xl border-primary/20 bg-card/95 backdrop-blur">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-primary" />
                        <CardTitle className="text-lg">Disk Settings</CardTitle>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
                        <X className="w-4 h-4" />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Storage Units</p>
                            <p className="text-xs text-muted-foreground">Choose how storage capacity and usage are calculated.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                            <button
                                onClick={() => handleSave('binary')}
                                className={cn(
                                    "relative p-4 rounded-xl border-2 text-left transition-all group",
                                    localSettings.unitSystem === 'binary' 
                                        ? "border-primary bg-primary/5" 
                                        : "border-border/50 hover:border-primary/30"
                                )}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <p className="text-sm font-bold">Binary (base 1024)</p>
                                    {localSettings.unitSystem === 'binary' && <Check className="w-4 h-4 text-primary" />}
                                </div>
                                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">GiB, MiB, KiB</p>
                            </button>

                            <button
                                onClick={() => handleSave('decimal')}
                                className={cn(
                                    "relative p-4 rounded-xl border-2 text-left transition-all group",
                                    localSettings.unitSystem === 'decimal' 
                                        ? "border-primary bg-primary/5" 
                                        : "border-border/50 hover:border-primary/30"
                                )}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <p className="text-sm font-bold">Decimal (base 1000)</p>
                                    {localSettings.unitSystem === 'decimal' && <Check className="w-4 h-4 text-primary" />}
                                </div>
                                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">GB, MB, KB</p>
                            </button>
                        </div>
                    </div>

                    {saving && (
                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground animate-pulse py-2">
                            <Spinner className="w-3 h-3" />
                            Saving...
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
