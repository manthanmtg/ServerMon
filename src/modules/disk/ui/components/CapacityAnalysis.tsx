'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search } from 'lucide-react';
import {
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { formatBytes } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import type { DiskSettings } from '../DiskSettingsModal';

export interface ScanResult {
  name: string;
  path: string;
  size: number;
  sizeStr: string;
}

interface CapacityAnalysisProps {
  settings: DiskSettings;
}

export function CapacityAnalysis({ settings }: CapacityAnalysisProps) {
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanPath, setScanPath] = useState('/');
  const { toast } = useToast();

  async function runScan() {
    if (!scanPath.trim()) {
      toast({
        title: 'Invalid Path',
        description: 'Please enter a valid directory path to scan.',
        variant: 'warning',
      });
      return;
    }

    setScanning(true);
    try {
      const res = await fetch('/api/modules/disk/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: scanPath }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze capacity');
      }

      if (data.results) {
        setScanResults(data.results);

        if (data.results.length === 0) {
          toast({
            title: 'Scan Complete',
            description: 'No large files or directories found.',
            variant: 'default',
          });
        }
      }
    } catch (e) {
      console.error('Failed to scan', e);
      toast({
        title: 'Scan Failed',
        description: e instanceof Error ? e.message : 'An unexpected error occurred during scan.',
        variant: 'destructive',
      });
    } finally {
      setScanning(false);
    }
  }

  return (
    <Card className="border-border/50 bg-card/50 shadow-sm transition-all duration-300 hover:border-primary/20 hover:bg-card/70 hover:shadow-[0_12px_32px_-24px_hsl(var(--primary)/0.45)]">
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">Capacity Analysis</CardTitle>
          <p className="truncate text-xs text-muted-foreground">
            Identify large directories in {scanPath}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            value={scanPath}
            onChange={(e) => setScanPath(e.target.value)}
            className="h-11 min-w-0 flex-1 bg-secondary/20 text-xs focus-visible:ring-primary/30 sm:w-28 sm:flex-none"
            placeholder="/path"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={runScan}
            disabled={scanning}
            className="h-11 min-w-[86px] gap-2 border-primary/20 bg-primary/10 text-[10px] font-bold uppercase tracking-widest text-primary transition-all hover:bg-primary/20 hover:shadow-sm hover:shadow-primary/20 active:scale-[0.98] focus-visible:ring-primary/30"
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
          <div className="flex flex-1 flex-col items-center justify-center space-y-4 rounded-xl border border-dashed border-border/60 bg-secondary/10 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/50 bg-secondary/60 shadow-inner">
              <Search className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <div className="max-w-[180px]">
              <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                Ready for Analysis
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Select a path and run scan to find space-hogging folders.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
