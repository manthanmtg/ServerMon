'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/spinner';
import type { AppsSettings } from '../types';

interface Props {
  settings: AppsSettings;
  onClose: () => void;
  onSaved: (next: AppsSettings) => void;
}

const saveErrorMessage = 'Failed to save apps settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAppsSettings(value: unknown): value is AppsSettings {
  return isRecord(value) && typeof value.releaseRetention === 'number';
}

function parseRetention(raw: string): number | undefined {
  if (!/^\d+$/.test(raw.trim())) return undefined;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > 50) return undefined;
  return value;
}

export default function AppsSettingsModal({ settings, onClose, onSaved }: Props) {
  const [retentionDraft, setRetentionDraft] = useState(String(settings.releaseRetention));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const parsedRetention = parseRetention(retentionDraft);
  const hasChanges = parsedRetention !== undefined && parsedRetention !== settings.releaseRetention;

  const handleSave = async () => {
    if (saving || !parsedRetention) return;

    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/modules/apps/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseRetention: parsedRetention }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const error =
          isRecord(data) && typeof data.error === 'string' ? data.error : saveErrorMessage;
        throw new Error(error);
      }
      const nextSettings = isRecord(data) ? data.settings : undefined;
      if (!isAppsSettings(nextSettings)) {
        throw new Error(saveErrorMessage);
      }

      onSaved(nextSettings);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : saveErrorMessage);
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
      title="Apps Settings"
      description="Control how much release history ServerMon keeps for each managed app."
      size="sm"
      dismissible={!saving}
      closeLabel="Close apps settings"
      contentClassName="animate-slide-up"
      footer={
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      }
    >
      <fieldset className="space-y-3">
        <legend className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Release Retention
        </legend>
        <label className="block space-y-2" htmlFor="apps-release-retention">
          <span className="block text-sm font-bold text-foreground">
            Keep last releases per app
          </span>
          <input
            id="apps-release-retention"
            type="number"
            min={1}
            max={50}
            step={1}
            value={retentionDraft}
            disabled={saving}
            onChange={(event) => setRetentionDraft(event.target.value)}
            className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="block text-xs text-muted-foreground">
            Older releases are pruned from the database and from disk after each deploy, update, or
            rollback. The current release is always kept. Allowed range: 1-50 (default 10).
          </span>
        </label>
      </fieldset>

      {saveError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          <p className="font-medium">Unable to save apps settings</p>
          <p className="mt-1 text-muted-foreground">{saveError}</p>
        </div>
      )}

      {saving && (
        <div
          aria-live="polite"
          className="flex items-center gap-2 pt-4 text-xs text-muted-foreground"
        >
          <Spinner className="h-3 w-3" />
          Saving apps settings...
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={() => void handleSave()} disabled={saving || !hasChanges}>
          Save settings
        </Button>
      </div>
    </Dialog>
  );
}
