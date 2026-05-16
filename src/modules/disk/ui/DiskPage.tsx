'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useMetrics } from '@/lib/MetricsContext';
import { HardDrive, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DiskSettingsModal, { DiskSettings } from './DiskSettingsModal';
import { DiskHardwareHealth } from './DiskHardwareHealth';
import { DiskSummaryCards } from './components/DiskSummaryCards';
import { IoThroughputChart } from './components/IoThroughputChart';
import { FilesystemsTable } from './components/FilesystemsTable';
import { CapacityAnalysis } from './components/CapacityAnalysis';

export default function DiskPage() {
  const { latest, history } = useMetrics();
  const [healthData, setHealthData] = useState<{
    layout: {
      name?: string;
      model?: string;
      interface?: string;
      type?: string;
      serialNum?: string;
      size: number;
    }[];
  } | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [settings, setSettings] = useState<DiskSettings>({ unitSystem: 'binary' });
  const [showSettings, setShowSettings] = useState(false);

  // Fetch settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/modules/disk/settings');
        const data = await res.json();
        if (data.settings) setSettings(data.settings);
      } catch (err) {
        console.error('Failed to load disk settings:', err);
      }
    };
    loadSettings();
  }, []);

  const fetchHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const res = await fetch('/api/modules/disk/health');
      const data = await res.json();
      setHealthData(data);
    } catch (e) {
      console.error('Failed to fetch health data', e);
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const ioData = useMemo(
    () =>
      history.map((h) => ({
        timestamp: new Date(h.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        read: h.io?.r_sec || 0,
        write: h.io?.w_sec || 0,
      })),
    [history]
  );

  // Derived stats for top cards
  const disks = latest?.disks || [];
  const primaryDisk =
    disks.find((d) => d.mount === '/System/Volumes/Data') ||
    disks.find((d) => d.mount === '/') ||
    disks[0];
  const totalIORead = latest?.io?.r_sec || 0;
  const totalIOWrite = latest?.io?.w_sec || 0;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
              Storage Dashboard
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="Disk settings"
            onClick={() => setShowSettings(true)}
            className="min-h-[44px] min-w-[44px] p-0 text-muted-foreground transition-colors hover:text-primary sm:h-8 sm:min-h-8 sm:w-8 sm:min-w-8"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        <DiskSummaryCards
          disks={disks}
          healthDriveCount={healthData?.layout?.length || 0}
          primaryDisk={primaryDisk}
          settings={settings}
          totalIORead={totalIORead}
          totalIOWrite={totalIOWrite}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* I/O Throughput Chart */}
          <IoThroughputChart ioData={ioData} settings={settings} />

          {/* Disk Space Table */}
          <FilesystemsTable disks={latest?.disks || []} settings={settings} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
          {/* Capacity Analysis */}
          <CapacityAnalysis settings={settings} />

          {/* Physical Hardware Health */}
          <DiskHardwareHealth
            loadingHealth={loadingHealth}
            healthData={healthData}
            settings={settings}
          />
        </div>
      </div>

      {showSettings && (
        <DiskSettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(next) => {
            setSettings(next);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
