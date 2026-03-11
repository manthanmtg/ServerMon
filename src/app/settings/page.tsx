'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Palette, Box, Shield, Check } from 'lucide-react';
import ProShell from '@/components/layout/ProShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ModuleInfo {
    id: string;
    name: string;
    description?: string;
}

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
    const { theme, setTheme, availableThemes } = useTheme();
    const [modules, setModules] = useState<ModuleInfo[]>([]);

    useEffect(() => {
        fetch('/api/modules')
            .then(res => res.json())
            .then(data => setModules(data.modules || []))
            .catch(err => console.error(err));
    }, []);

    return (
        <ProShell title="Settings" subtitle="Configuration">
            <div className="space-y-6 animate-fade-in">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Settings</h2>
                    <p className="text-sm text-muted-foreground mt-1">Manage your appearance and modules.</p>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Left Column */}
                    <div className="xl:col-span-2 space-y-6">
                        {/* Theme Selector */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Palette className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">Appearance</CardTitle>
                                        <CardDescription>Choose a theme for the interface</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {availableThemes.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setTheme(t.id)}
                                            className={`relative p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                                                theme.id === t.id
                                                    ? 'border-primary shadow-sm'
                                                    : 'border-border hover:border-muted-foreground/30'
                                            }`}
                                        >
                                            {theme.id === t.id && (
                                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                                    <Check className="w-3 h-3 text-primary-foreground" />
                                                </div>
                                            )}
                                            <div className="flex gap-1.5 mb-3 h-5">
                                                <div className="flex-1 rounded-full" style={{ backgroundColor: t.colors.primary }} />
                                                <div className="flex-1 rounded-full" style={{ backgroundColor: t.colors.accent || t.colors.secondary }} />
                                                <div className="flex-1 rounded-full" style={{ backgroundColor: t.colors.background, border: `1px solid ${t.colors.border}` }} />
                                            </div>
                                            <p className="text-sm font-medium text-foreground">{t.name}</p>
                                            <p className="text-xs text-muted-foreground capitalize">{t.type}</p>
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Modules */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Box className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">Modules</CardTitle>
                                        <CardDescription>Installed modules and their status</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {modules.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-4 text-center">No modules installed</p>
                                ) : (
                                    <div className="divide-y divide-border">
                                        {modules.map(mod => (
                                            <div key={mod.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                                                        <Box className="w-4 h-4 text-muted-foreground" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-foreground">{mod.name}</p>
                                                        <p className="text-xs text-muted-foreground">{mod.description || `${mod.id} module`}</p>
                                                    </div>
                                                </div>
                                                <Badge variant="success">Active</Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Shield className="w-4 h-4 text-primary" />
                                    </div>
                                    <CardTitle className="text-base">Security</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Password hashing</span>
                                        <span className="text-sm font-medium text-foreground">Argon2id</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Two-factor auth</span>
                                        <Badge variant="success">Enabled</Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Session expiry</span>
                                        <span className="text-sm font-medium text-foreground">2 hours</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">About</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Version</span>
                                        <span className="text-sm font-medium text-foreground">1.0.0</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Runtime</span>
                                        <span className="text-sm font-medium text-foreground">Next.js</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Database</span>
                                        <span className="text-sm font-medium text-foreground">MongoDB</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </ProShell>
    );
}
