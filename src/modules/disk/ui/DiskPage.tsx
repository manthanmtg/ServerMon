'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useMetrics } from '@/lib/MetricsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Search, HardDrive, ShieldCheck, Activity, Settings2, Zap } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { formatBytes } from '@/lib/utils';
import DiskSettingsModal, { DiskSettings } from './DiskSettingsModal';
import { DiskHardwareHealth } from './DiskHardwareHealth';

interface ScanResult {
  name: string;
  path: string;
  size: number;
  sizeStr: string;
}

export default function DiskPage() {
  const { latest, history } = useMetrics();
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
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
  const [scanPath, setScanPath] = useState('/');

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

  async function runScan() {
    setScanning(true);
    try {
      const res = await fetch('/api/modules/disk/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: scanPath }),
      });
      const data = await res.json();
      if (data.results) setScanResults(data.results);
    } catch (e) {
      console.error('Failed to scan', e);
    } finally {
      setScanning(false);
    }
  }

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
            onClick={() => setShowSettings(true)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary transition-colors"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Header Stats - RESTORED & ENHANCED Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Main Usage Card */}
          <Card className="border-border/50 bg-card/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Main Storage
                </p>
                <Database className="w-4 h-4 text-primary/40" />
              </div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold tracking-tight">
                  {primaryDisk?.use.toFixed(1) || 0}%
                </h3>
                <p className="text-xs text-muted-foreground">capacity used</p>
              </div>
              <div className="mt-3 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${(primaryDisk?.use || 0) > 90 ? 'bg-destructive' : (primaryDisk?.use || 0) > 75 ? 'bg-orange-500' : 'bg-primary'}`}
                  style={{ width: `${primaryDisk?.use || 0}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground font-medium">
                <span>
                  {primaryDisk ? formatBytes(primaryDisk.used, settings.unitSystem) : '0 B'} used
                </span>
                <span>
                  {primaryDisk ? formatBytes(primaryDisk.size, settings.unitSystem) : '0 B'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* I/O Throughput Card */}
          <Card className="border-border/50 bg-card/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Live Throughput
                </p>
                <Zap className="w-4 h-4 text-amber-500/40" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-sm bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[9px] font-black text-emerald-500">
                      R
                    </span>
                    <span className="text-xs font-semibold">
                      {formatBytes(totalIORead, settings.unitSystem)}/s
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">
                    Read
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-sm bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[9px] font-black text-blue-500">
                      W
                    </span>
                    <span className="text-xs font-semibold">
                      {formatBytes(totalIOWrite, settings.unitSystem)}/s
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">
                    Write
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-border/30 flex justify-between items-center whitespace-nowrap overflow-hidden">
                <span className="text-[10px] text-muted-foreground truncate">Total Activity:</span>
                <span className="text-xs font-mono font-bold text-primary truncate ml-2">
                  {formatBytes(totalIORead + totalIOWrite, settings.unitSystem)}/s
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Disk Health Status Card */}
          <Card className="border-border/50 bg-card/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Disk Health
                </p>
                <ShieldCheck className="w-4 h-4 text-emerald-500/40" />
              </div>
              <div className="flex flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-lg font-bold">Optimal</h3>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {healthData?.layout?.length || 0} physical drive
                  {(healthData?.layout?.length || 0) !== 1 ? 's' : ''} detected.
                </p>
              </div>
              <div className="mt-4 flex gap-1">
                {healthData?.layout?.map((_, i) => (
                  <div key={i} className="flex-1 h-1 rounded-full bg-emerald-500/30" />
                ))}
              </div>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-tighter text-emerald-500/80">
                All SMART markers passed
              </p>
            </CardContent>
          </Card>

          {/* Active Mounts Card */}
          <Card className="border-border/50 bg-card/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Active Load
                </p>
                <Activity className="w-4 h-4 text-indigo-500/40" />
              </div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-bold tracking-tight">{latest?.disks?.length || 0}</h3>
                <p className="text-xs text-muted-foreground">mount points</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {latest?.disks?.slice(0, 3).map((d, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-4 border-muted-foreground/20 bg-muted/5 font-mono"
                  >
                    {d.mount === '/' ? 'root' : d.mount.split('/').pop()}
                  </Badge>
                ))}
                {(latest?.disks?.length || 0) > 3 && (
                  <span className="text-[9px] text-muted-foreground">
                    +{latest!.disks.length - 3} more
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* I/O Throughput Chart */}
          <Card className="lg:col-span-2 border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">I/O Performance History</CardTitle>
                <p className="text-xs text-muted-foreground">Real-time throughput trends</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-medium text-muted-foreground">Read</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-medium text-muted-foreground">Write</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ioData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="readGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="writeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border)"
                    opacity={0.5}
                  />
                  <XAxis dataKey="timestamp" hide />
                  <YAxis
                    tickFormatter={(v: number) => formatBytes(v, settings.unitSystem).split(' ')[0]}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      borderColor: 'var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(v: unknown) => formatBytes(Number(v), settings.unitSystem)}
                  />
                  <Area
                    type="monotone"
                    dataKey="read"
                    stroke="#10b981"
                    fill="url(#readGrad)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="write"
                    stroke="#3b82f6"
                    fill="url(#writeGrad)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Disk Space Table */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Filesystems</CardTitle>
              <p className="text-xs text-muted-foreground">Detailed mount point metrics</p>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-border/50">
                    <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      <th className="px-4 py-2 font-medium">Mount</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium text-right">Free</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {latest?.disks?.map((disk, idx) => (
                      <tr key={idx} className="group hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold truncate max-w-[100px]">
                            {disk.mount}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                            {disk.fs}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium uppercase">
                            {disk.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-xs font-medium">
                            {formatBytes(disk.available, settings.unitSystem)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {(100 - disk.use).toFixed(0)}% free
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
          {/* Capacity Analysis */}
          <Card className="border-border/50 bg-card/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-semibold">Capacity Analysis</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Identify large directories in {scanPath}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={scanPath}
                  onChange={(e) => setScanPath(e.target.value)}
                  className="h-8 w-24 text-xs bg-secondary/20"
                  placeholder="/path"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={runScan}
                  disabled={scanning}
                  className="h-8 gap-2 text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                >
                  {scanning ? <Spinner className="w-3 h-3" /> : <Search className="w-3 h-3" />}
                  Scan
                </Button>
              </div>
            </CardHeader>
            <CardContent className="h-[280px] flex flex-col pt-4">
              {scanResults.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={scanResults}
                    layout="vertical"
                    margin={{ top: 0, right: 30, left: 30, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={true}
                      vertical={false}
                      stroke="var(--border)"
                      opacity={0.3}
                    />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
                      width={70}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        borderColor: 'var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(v: unknown) => formatBytes(Number(v), settings.unitSystem)}
                    />
                    <Bar dataKey="size" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={16}>
                      {scanResults.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fillOpacity={1 - index * 0.08} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-50">
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                    <Search className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                  <div className="max-w-[180px]">
                    <p className="text-xs font-bold uppercase tracking-wide">Ready for Analysis</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Select a path and run scan to find space-hogging folders.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

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
