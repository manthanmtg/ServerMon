'use client';

import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export interface FileBrowserShortcut {
    id: string;
    label: string;
    path: string;
}

export interface FileBrowserSettings {
    shortcuts: FileBrowserShortcut[];
    defaultPath: string;
    editorMaxBytes: number;
    previewMaxBytes: number;
}

interface Props {
    settings: FileBrowserSettings;
    onClose: () => void;
    onSaved: (settings: FileBrowserSettings) => void;
}

function makeShortcutId(label: string) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `shortcut-${Date.now()}`;
}

export default function FileBrowserSettingsModal({ settings, onClose, onSaved }: Props) {
    const [form, setForm] = useState<FileBrowserSettings>({
        ...settings,
        shortcuts: settings.shortcuts.map((shortcut) => ({ ...shortcut })),
    });
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const canSave = useMemo(() => form.shortcuts.every((shortcut) => shortcut.label.trim() && shortcut.path.trim()), [form.shortcuts]);

    const updateShortcut = (index: number, key: 'label' | 'path', value: string) => {
        setForm((current) => ({
            ...current,
            shortcuts: current.shortcuts.map((shortcut, shortcutIndex) => (
                shortcutIndex === index
                    ? {
                        ...shortcut,
                        [key]: value,
                        id: key === 'label' ? makeShortcutId(value) : shortcut.id,
                    }
                    : shortcut
            )),
        }));
    };

    const addShortcut = () => {
        setForm((current) => ({
            ...current,
            shortcuts: [...current.shortcuts, { id: `shortcut-${Date.now()}`, label: '', path: '' }],
        }));
    };

    const removeShortcut = (index: number) => {
        setForm((current) => ({
            ...current,
            shortcuts: current.shortcuts.filter((_, shortcutIndex) => shortcutIndex !== index),
        }));
    };

    const handleSave = async () => {
        if (!canSave) {
            toast({ title: 'Every shortcut needs a label and path', variant: 'warning' });
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/modules/file-browser/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save settings');
            }

            onSaved(data.settings as FileBrowserSettings);
            window.dispatchEvent(new CustomEvent('file-browser-shortcuts-updated', { detail: data.settings }));
            onClose();
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : 'Failed to save settings', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <div className="relative w-full max-w-3xl rounded-xl border border-border bg-card animate-slide-up" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-border p-5">
                    <div>
                        <h3 className="text-base font-semibold text-foreground">File Browser Settings</h3>
                        <p className="text-xs text-muted-foreground mt-1">Manage shortcuts and editor limits shown in the top bar.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="min-h-[44px] min-w-[44px] rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex items-center justify-center"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="grid gap-5 p-5 lg:grid-cols-[1.4fr,0.8fr]">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-foreground">Topbar shortcuts</p>
                                <p className="text-xs text-muted-foreground mt-1">Absolute paths only. Root and home can be edited or removed.</p>
                            </div>
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={addShortcut}>
                                <Plus className="w-3.5 h-3.5" />
                                Add
                            </Button>
                        </div>

                        <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
                            {form.shortcuts.map((shortcut, index) => (
                                <div key={shortcut.id || `${index}-${shortcut.path}`} className="rounded-xl border border-border bg-secondary/20 p-3">
                                    <div className="grid gap-3 sm:grid-cols-[0.9fr,1.5fr,auto]">
                                        <Input
                                            label="Label"
                                            value={shortcut.label}
                                            onChange={(event) => updateShortcut(index, 'label', event.target.value)}
                                            placeholder="Logs"
                                        />
                                        <Input
                                            label="Path"
                                            value={shortcut.path}
                                            onChange={(event) => updateShortcut(index, 'path', event.target.value)}
                                            placeholder="/var/log"
                                        />
                                        <div className="flex items-end">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive"
                                                onClick={() => removeShortcut(index)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Input
                            label="Default path"
                            value={form.defaultPath}
                            onChange={(event) => setForm((current) => ({ ...current, defaultPath: event.target.value }))}
                            placeholder="/"
                        />
                        <Input
                            label="Editor limit (bytes)"
                            type="number"
                            min={32768}
                            max={10485760}
                            value={String(form.editorMaxBytes)}
                            onChange={(event) => setForm((current) => ({ ...current, editorMaxBytes: Number(event.target.value) }))}
                        />
                        <Input
                            label="Preview limit (bytes)"
                            type="number"
                            min={32768}
                            max={10485760}
                            value={String(form.previewMaxBytes)}
                            onChange={(event) => setForm((current) => ({ ...current, previewMaxBytes: Number(event.target.value) }))}
                        />
                        <div className="rounded-xl border border-border bg-secondary/20 p-4">
                            <p className="text-sm font-medium text-foreground">Behavior</p>
                            <p className="text-xs text-muted-foreground mt-2 leading-5">
                                Preview uses the preview limit for text and log files. Edit mode uses the editor limit and keeps binary files read-only.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border p-5">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} loading={saving}>Save</Button>
                </div>
            </div>
        </div>
    );
}
