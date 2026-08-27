'use client';

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';
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

const saveErrorMessage = 'Failed to save disk settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDiskSettings(value: unknown): value is DiskSettings {
  return isRecord(value) && (value.unitSystem === 'binary' || value.unitSystem === 'decimal');
}

export default function DiskSettingsModal({ settings, onClose, onSaved }: Props) {
  const [localSettings, setLocalSettings] = useState<DiskSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (unitSystem: 'binary' | 'decimal') => {
    if (saving || unitSystem === localSettings.unitSystem) return;

    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/modules/disk/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...localSettings, unitSystem }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const error =
          isRecord(data) && typeof data.error === 'string' ? data.error : saveErrorMessage;
        throw new Error(error);
      }
      const nextSettings = isRecord(data) ? data.settings : undefined;
      if (!isDiskSettings(nextSettings)) {
        throw new Error(saveErrorMessage);
      }

      setLocalSettings(nextSettings);
      onSaved(nextSettings);
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
      title="Disk Settings"
      description="Choose how storage capacity and usage are calculated."
      size="sm"
      dismissible={!saving}
      closeLabel="Close disk settings"
      contentClassName="animate-slide-up"
      footer={
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      }
    >
      <fieldset className="space-y-3">
        <legend className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Storage Units
        </legend>
        <div className="grid grid-cols-1 gap-3">
          {(
            [
              {
                unitSystem: 'binary',
                label: 'Binary (base 1024)',
                units: 'GiB, MiB, KiB',
              },
              {
                unitSystem: 'decimal',
                label: 'Decimal (base 1000)',
                units: 'GB, MB, KB',
              },
            ] as const
          ).map(({ unitSystem, label, units }) => {
            const isSelected = localSettings.unitSystem === unitSystem;

            return (
              <label
                key={unitSystem}
                className={cn(
                  'relative block min-h-[44px] cursor-pointer rounded-xl border-2 p-4 text-left transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-primary/30',
                  saving && 'cursor-not-allowed opacity-70'
                )}
              >
                <input
                  type="radio"
                  name="disk-unit-system"
                  value={unitSystem}
                  checked={isSelected}
                  disabled={saving}
                  onChange={() => handleSave(unitSystem)}
                  className="sr-only"
                />
                <span className="flex items-start justify-between gap-4">
                  <span>
                    <span className="block text-sm font-bold text-foreground">{label}</span>
                    <span className="mt-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                      {units}
                    </span>
                  </span>
                  {isSelected && <Check aria-hidden="true" className="h-4 w-4 text-primary" />}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {saveError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          <p className="font-medium">Unable to save disk settings</p>
          <p className="mt-1 text-muted-foreground">{saveError} Try selecting a unit again.</p>
        </div>
      )}

      {saving && (
        <div
          aria-live="polite"
          className="flex items-center gap-2 pt-4 text-xs text-muted-foreground"
        >
          <Spinner className="h-3 w-3" />
          Saving disk settings...
        </div>
      )}
    </Dialog>
  );
}
