'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import {
  Palette,
  Box,
  Shield,
  Check,
  LoaderCircle,
  History,
  Layout,
  Upload,
  Image as ImageIcon,
  Type,
  X,
} from 'lucide-react';
import ProShell from '@/components/layout/ProShell';
import { useBrand } from '@/lib/BrandContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import PasskeySettings from '@/modules/security/ui/PasskeySettings';
import { useToast } from '@/components/ui/toast';
import UpdateHistoryModal from '@/components/settings/UpdateHistoryModal';
import QuickAccessSettings from '@/components/settings/QuickAccessSettings';
import ServerMonServicesCard from '@/components/settings/ServerMonServicesCard';

interface ModuleInfo {
  id: string;
  name: string;
  description?: string;
}

export default function SettingsPage() {
  const { theme, setTheme, availableThemes } = useTheme();
  const { settings: brandSettings, updateSettings: updateBrandSettings } = useBrand();
  const { toast } = useToast();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Branding state
  const [pageTitle, setPageTitle] = useState(brandSettings.pageTitle);
  const [logoBase64, setLogoBase64] = useState(brandSettings.logoBase64);
  const [isSavingBrand, setIsSavingBrand] = useState(false);

  useEffect(() => {
    setPageTitle(brandSettings.pageTitle);
    setLogoBase64(brandSettings.logoBase64);
  }, [brandSettings]);

  useEffect(() => {
    fetch('/api/modules')
      .then((res) => res.json())
      .then((data) => setModules(data.modules || []))
      .catch((err) => console.error(err));
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      // 1MB limit
      toast({
        title: 'Error',
        description: 'Logo size should be less than 1MB',
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBranding = async () => {
    setIsSavingBrand(true);
    try {
      await updateBrandSettings({ pageTitle, logoBase64 });
      toast({
        title: 'Branding Updated',
        description: 'Branding settings have been saved successfully',
        variant: 'success',
      });
    } catch (_err) {
      toast({
        title: 'Error',
        description: 'Failed to update branding settings',
        variant: 'destructive',
      });
    } finally {
      setIsSavingBrand(false);
    }
  };

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
                        <div
                          className="flex-1 rounded-full"
                          style={{ backgroundColor: t.colors.primary }}
                        />
                        <div
                          className="flex-1 rounded-full"
                          style={{ backgroundColor: t.colors.accent || t.colors.secondary }}
                        />
                        <div
                          className="flex-1 rounded-full"
                          style={{
                            backgroundColor: t.colors.background,
                            border: `1px solid ${t.colors.border}`,
                          }}
                        />
                      </div>
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{t.type}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Access */}
            <QuickAccessSettings />

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
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No modules installed
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {modules.map((mod) => (
                      <div
                        key={mod.id}
                        className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                            <Box className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{mod.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {mod.description || `${mod.id} module`}
                            </p>
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

            {/* Branding */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Layout className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Branding</CardTitle>
                    <CardDescription>Customize logo and title</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    <Type className="w-3 h-3" />
                    <span>Page Title</span>
                  </div>
                  <input
                    type="text"
                    value={pageTitle}
                    onChange={(e) => setPageTitle(e.target.value)}
                    placeholder="e.g. MyServer"
                    className="w-full px-3 py-2 bg-accent/20 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    <ImageIcon className="w-3 h-3" />
                    <span>Logo</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl border border-border bg-accent/20 flex items-center justify-center overflow-hidden shrink-0 group relative">
                      {logoBase64 ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={logoBase64}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                      )}
                      {logoBase64 && (
                        <button
                          onClick={() => setLogoBase64('')}
                          className="absolute inset-0 bg-destructive/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        >
                          <X className="w-5 h-5 text-white" />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="flex items-center justify-center gap-2 w-full h-10 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold transition-all cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Image</span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={handleLogoUpload}
                        />
                      </label>
                      <p className="text-[10px] text-muted-foreground text-center">
                        PNG, JPG or SVG (Max 1MB)
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveBranding}
                  disabled={isSavingBrand}
                  className="w-full h-11 flex items-center justify-center bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all disabled:opacity-50"
                >
                  {isSavingBrand ? (
                    <LoaderCircle className="w-4 h-4 animate-spin" />
                  ) : (
                    'Save Branding Changes'
                  )}
                </button>
              </CardContent>
            </Card>

            <PasskeySettings />

            <ServerMonServicesCard />

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">About</CardTitle>
                  <button
                    type="button"
                    onClick={() => setShowHistory(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-all hover:bg-accent"
                    title="View update history"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                </div>
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

      {showHistory && <UpdateHistoryModal onClose={() => setShowHistory(false)} />}
    </ProShell>
  );
}
