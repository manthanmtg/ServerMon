'use client';

import React from 'react';
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
import type { DiskSettings } from '../DiskSettingsModal';

export interface ScanResult {
  name: string;
  path: string;
  size: number;
  sizeStr: string;
}

interface CapacityAnalysisProps {
  scanPath: string;
  setScanPath: (path: string) => void;
  runScan: () => void;
  scanning: boolean;
  scanResults: ScanResult[];
  settings: DiskSettings;
}

export function CapacityAnalysis({
  scanPath,
  setScanPath,
  runScan,
  scanning,
  scanResults,
  settings,
}: CapacityAnalysisProps) {
  return (
    <Card className="border-border/50 bg-card/50 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">Capacity Analysis</CardTitle>
          <p className="text-xs text-muted-foreground">Identify large directories in {scanPath}</p>
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
  );
}
