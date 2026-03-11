'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface TermSettings {
    idleTimeoutMinutes: number;
    maxSessions: number;
    fontSize: number;
}

interface Props {
    settings: TermSettings;
    onClose: () => void;
    onSaved: (settings: TermSettings) => void;
}

function SettingRow({ label, description, children }: {
    label: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
            <div className="min-w-0 mr-4">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

export default function TerminalSettingsModal({ settings, onClose, onSaved }: Props) {
    const [form, setForm] = useState<TermSettings>({ ...settings });
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/terminal/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save');
            }
            const data = await res.json();
            onSaved(data.settings);
            onClose();
        } catch (err) {
            toast({ title: err instanceof Error ? err.message : 'Failed to save settings', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <div className="relative rounded-xl border border-border bg-card w-full max-w-md animate-slide-up" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <h3 className="text-base font-semibold text-foreground">Terminal Settings</h3>
                    <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 py-2">
                    <SettingRow
                        label="Idle timeout"
                        description="Close inactive sessions after this duration"
                    >
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min={1}
                                max={1440}
                                value={form.idleTimeoutMinutes}
                                onChange={(e) => setForm({ ...form, idleTimeoutMinutes: Number(e.target.value) })}
                                className="w-16 h-8 rounded-md border border-input bg-background text-sm text-foreground text-center outline-none focus:ring-2 focus:ring-ring/40"
                            />
                            <span className="text-xs text-muted-foreground">min</span>
                        </div>
                    </SettingRow>

                    <SettingRow
                        label="Max sessions"
                        description="Maximum number of terminal tabs"
                    >
                        <input
                            type="number"
                            min={1}
                            max={20}
                            value={form.maxSessions}
                            onChange={(e) => setForm({ ...form, maxSessions: Number(e.target.value) })}
                            className="w-16 h-8 rounded-md border border-input bg-background text-sm text-foreground text-center outline-none focus:ring-2 focus:ring-ring/40"
                        />
                    </SettingRow>

                    <SettingRow
                        label="Font size"
                        description="Terminal font size in pixels"
                    >
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min={10}
                                max={24}
                                value={form.fontSize}
                                onChange={(e) => setForm({ ...form, fontSize: Number(e.target.value) })}
                                className="w-16 h-8 rounded-md border border-input bg-background text-sm text-foreground text-center outline-none focus:ring-2 focus:ring-ring/40"
                            />
                            <span className="text-xs text-muted-foreground">px</span>
                        </div>
                    </SettingRow>
                </div>

                <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} loading={saving}>Save</Button>
                </div>
            </div>
        </div>
    );
}
