'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/toast';

interface TermSettings {
  idleTimeoutMinutes: number;
  maxSessions: number;
  fontSize: number;
  loginAsUser: string;
  defaultDirectory: string;
}

interface Props {
  settings: TermSettings;
  onClose: () => void;
  onSaved: (settings: TermSettings) => void;
}

function SettingRow({
  label,
  description,
  inputId,
  children,
}: {
  label: string;
  description: string;
  inputId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="min-w-0 mr-4">
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <p id={`${inputId}-description`} className="text-xs text-muted-foreground mt-0.5">
          {description}
        </p>
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
      toast({
        title: err instanceof Error ? err.message : 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Terminal Settings"
      size="sm"
      closeLabel="Close terminal settings dialog"
      contentClassName="animate-slide-up"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="py-2">
        <SettingRow
          label="Idle timeout"
          description="Close inactive sessions after this duration"
          inputId="terminal-idle-timeout"
        >
          <div className="flex items-center gap-2">
            <input
              id="terminal-idle-timeout"
              type="number"
              min={1}
              max={1440}
              value={form.idleTimeoutMinutes}
              onChange={(e) => setForm({ ...form, idleTimeoutMinutes: Number(e.target.value) })}
              aria-describedby="terminal-idle-timeout-description"
              className="w-16 h-8 rounded-md border border-input bg-background text-sm text-foreground text-center outline-none focus:ring-2 focus:ring-ring/40"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </div>
        </SettingRow>

        <SettingRow
          label="Max sessions"
          description="Maximum number of terminal tabs"
          inputId="terminal-max-sessions"
        >
          <input
            id="terminal-max-sessions"
            type="number"
            min={1}
            max={20}
            value={form.maxSessions}
            onChange={(e) => setForm({ ...form, maxSessions: Number(e.target.value) })}
            aria-describedby="terminal-max-sessions-description"
            className="w-16 h-8 rounded-md border border-input bg-background text-sm text-foreground text-center outline-none focus:ring-2 focus:ring-ring/40"
          />
        </SettingRow>

        <SettingRow
          label="Font size"
          description="Terminal font size in pixels"
          inputId="terminal-font-size"
        >
          <div className="flex items-center gap-2">
            <input
              id="terminal-font-size"
              type="number"
              min={10}
              max={24}
              value={form.fontSize}
              onChange={(e) => setForm({ ...form, fontSize: Number(e.target.value) })}
              aria-describedby="terminal-font-size-description"
              className="w-16 h-8 rounded-md border border-input bg-background text-sm text-foreground text-center outline-none focus:ring-2 focus:ring-ring/40"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        </SettingRow>

        <SettingRow
          label="Login as user"
          description="User account to run the terminal as"
          inputId="terminal-login-as-user"
        >
          <input
            id="terminal-login-as-user"
            type="text"
            placeholder="default"
            value={form.loginAsUser}
            onChange={(e) => setForm({ ...form, loginAsUser: e.target.value })}
            aria-describedby="terminal-login-as-user-description"
            className="w-32 h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40"
          />
        </SettingRow>

        <SettingRow
          label="Default directory"
          description="Working directory when terminal opens"
          inputId="terminal-default-directory"
        >
          <input
            id="terminal-default-directory"
            type="text"
            placeholder="Server root"
            value={form.defaultDirectory}
            onChange={(e) => setForm({ ...form, defaultDirectory: e.target.value })}
            aria-describedby="terminal-default-directory-description"
            className="w-44 h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground font-mono outline-none focus:ring-2 focus:ring-ring/40"
          />
        </SettingRow>
      </div>
    </Dialog>
  );
}
