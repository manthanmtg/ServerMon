'use client';

import React, { useState, useCallback } from 'react';
import {
  X,
  Wifi,
  Download,
  Upload,
  Activity,
  Gauge,
  Server,
  History,
  Play,
  RotateCcw,
  Milestone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { SpeedtestProgress } from '@/lib/network/speedtest';

interface SpeedtestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpeedtestModal({ isOpen, onClose }: SpeedtestModalProps) {
  const [phase, setPhase] = useState<'idle' | 'testing' | 'completed' | 'error'>('idle');
  const [currentTest, setCurrentTest] = useState<'ping' | 'download' | 'upload' | null>(null);
  const [speed, setSpeed] = useState(0); // Current speed for gauge
  const [results, setResults] = useState<{
    ping: number | null;
    jitter: number | null;
    download: number | null;
    upload: number | null;
    isp: string | null;
    server: string | null;
    location: string | null;
  }>({
    ping: null,
    jitter: null,
    download: null,
    upload: null,
    isp: null,
    server: null,
    location: null,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startTest = useCallback(() => {
    setPhase('testing');
    setErrorMessage(null);
    setResults({
      ping: null,
      jitter: null,
      download: null,
      upload: null,
      isp: null,
      server: null,
      location: null,
    });

    const eventSource = new EventSource('/api/modules/network/speedtest');

    eventSource.onmessage = (event) => {
      const data: SpeedtestProgress = JSON.parse(event.data);

      if (data.type === 'ping') {
        setCurrentTest('ping');
        if (data.ping_ms)
          setResults((prev) => ({ ...prev, ping: data.ping_ms!, jitter: data.jitter || null }));
      } else if (data.type === 'download') {
        setCurrentTest('download');
        if (data.speed) {
          const mbps = data.speed / 1_000_000;
          setSpeed(mbps);
          setResults((prev) => ({ ...prev, download: mbps }));
        }
      } else if (data.type === 'upload') {
        setCurrentTest('upload');
        if (data.speed) {
          const mbps = data.speed / 1_000_000;
          setSpeed(mbps);
          setResults((prev) => ({ ...prev, upload: mbps }));
        }
      } else if (data.type === 'result') {
        setSpeed(0);
        setResults((prev) => ({
          ...prev,
          ping: data.ping_ms!,
          jitter: data.jitter || null,
          download: (data.speed || 0) / 1_000_000,
          isp: data.isp || null,
          server: data.server || null,
          location: data.location || null,
        }));
        setPhase('completed');
        eventSource.close();
      } else if (data.type === 'error') {
        setErrorMessage(data.error || 'Speedtest failed');
        setPhase('error');
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      setErrorMessage('Connection lost');
      setPhase('error');
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  if (!isOpen) return null;

  // Gauge calculation
  // Max scale 1000 Mbps
  const needleRotation = (Math.min(speed, 1000) / 1000) * 180 - 90;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={phase === 'testing' ? undefined : onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-primary/10 animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Gauge size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">System Speedtest</h2>
              <p className="text-xs text-muted-foreground font-medium">
                Testing server internet connectivity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={phase === 'testing'}
            className="p-2 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 flex flex-col items-center">
          {phase === 'idle' ? (
            <div className="text-center space-y-8 py-10 w-full">
              <div className="relative inline-flex">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                <div className="relative bg-muted/50 w-32 h-32 rounded-full flex items-center justify-center border border-border shadow-inner">
                  <Wifi size={48} className="text-primary animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">Ready to Test?</h3>
                <p className="text-muted-foreground max-w-xs mx-auto text-sm">
                  This will measure the server&apos;s current download, upload speeds, and network
                  latency.
                </p>
              </div>
              <Button
                size="lg"
                className="px-10 h-14 rounded-full text-lg font-bold gap-3 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:scale-105 active:scale-95"
                onClick={startTest}
              >
                <Play size={20} fill="currentColor" />
                Start Speedtest
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-8">
              {/* Gauge Visualization */}
              <div className="flex flex-col items-center relative py-4">
                {/* Semi-circle Gauge */}
                <div className="relative w-64 h-32 overflow-hidden">
                  {/* Track */}
                  <div className="absolute inset-0 border-[16px] border-muted rounded-t-full" />
                  {/* Progress Fill */}
                  <div
                    className="absolute inset-0 border-[16px] border-primary rounded-t-full transition-all duration-500 origin-bottom"
                    style={{
                      clipPath: `polygon(50% 100%, 0% 100%, 0% 0%, 100% 0%, 100% 100%, 50% 100%)`,
                      transform: `rotate(${(Math.min(speed, 1000) / 1000) * 180 - 180}deg)`,
                    }}
                  />
                  {/* Needle */}
                  <div
                    className="absolute bottom-0 left-1/2 w-1.5 h-32 bg-primary origin-bottom transition-all duration-500 rounded-full"
                    style={{ transform: `translateX(-50%) rotate(${needleRotation}deg)` }}
                  >
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full shadow-lg" />
                  </div>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-background border-2 border-primary rounded-full z-10" />
                </div>

                {/* Speed Display */}
                <div className="mt-4 text-center">
                  <div className="text-5xl font-black tracking-tighter tabular-nums drop-shadow-sm">
                    {phase === 'testing' ? Math.round(speed) : (results.download || 0).toFixed(1)}
                  </div>
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
                    Mbps
                  </div>
                </div>

                {/* Testing Label */}
                {phase === 'testing' && (
                  <div className="absolute -top-4 right-0 flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse border border-primary/20">
                    {currentTest === 'ping' && <Activity size={12} />}
                    {currentTest === 'download' && <Download size={12} />}
                    {currentTest === 'upload' && <Upload size={12} />}
                    {currentTest || 'connecting'}
                  </div>
                )}
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-4">
                <MetricCard
                  label="Ping"
                  value={results.ping ? `${Math.round(results.ping)}ms` : '--'}
                  icon={<Activity size={16} />}
                  active={currentTest === 'ping'}
                  completed={results.ping !== null}
                />
                <MetricCard
                  label="Download"
                  value={results.download ? `${results.download.toFixed(1)} Mbps` : '--'}
                  icon={<Download size={16} />}
                  active={currentTest === 'download'}
                  completed={results.download !== null && currentTest !== 'download'}
                />
                <MetricCard
                  label="Upload"
                  value={results.upload ? `${results.upload.toFixed(1)} Mbps` : '--'}
                  icon={<Upload size={16} />}
                  active={currentTest === 'upload'}
                  completed={
                    (results.upload !== null && currentTest !== 'upload') || phase === 'completed'
                  }
                />
              </div>

              {/* Additional Info / Results */}
              <div className="bg-muted/40 rounded-2xl p-5 space-y-4 border border-border/50">
                <div className="grid grid-cols-2 gap-y-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Server size={10} /> ISP Provider
                    </p>
                    <p className="text-sm font-semibold truncate pr-4">
                      {results.isp || (phase === 'testing' ? 'Identifying...' : '--')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Milestone size={10} /> Server Location
                    </p>
                    <p className="text-sm font-semibold truncate">
                      {results.server
                        ? `${results.server}, ${results.location}`
                        : phase === 'testing'
                          ? 'Locating...'
                          : '--'}
                    </p>
                  </div>
                </div>

                {phase === 'completed' && (
                  <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                    <p className="text-[10px] font-medium text-muted-foreground italic">
                      Tested via speedtest-net on {new Date().toLocaleTimeString()}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-xs font-bold gap-2 hover:bg-primary/10 hover:text-primary transition-colors"
                      onClick={startTest}
                    >
                      <RotateCcw size={14} />
                      Test Again
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="mt-4 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-3 w-full">
              <X size={18} className="shrink-0" />
              <p>{errorMessage}</p>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-[10px] border-destructive/30 hover:bg-destructive/10 text-destructive font-bold"
                onClick={startTest}
              >
                Retry
              </Button>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="px-8 py-4 bg-muted/20 border-t border-border flex items-center justify-center gap-3">
          <History size={14} className="text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide">
            RESULT HISTORY IS SAVED LOCALLY IN SESSION
          </span>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  active = false,
  completed = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  active?: boolean;
  completed?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center p-4 rounded-2xl border transition-all duration-300',
        active
          ? 'bg-primary/10 border-primary/30 shadow-sm'
          : completed
            ? 'bg-muted/30 border-border'
            : 'bg-muted/10 border-border/30 opacity-50'
      )}
    >
      <div
        className={cn(
          'p-2 rounded-xl mb-2 transition-colors',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {icon}
      </div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-sm font-black tracking-tight">{value}</p>
      {active && (
        <div className="mt-2 w-full h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary animate-progress-indeterminate rounded-full" />
        </div>
      )}
    </div>
  );
}
