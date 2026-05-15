'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, LoaderCircle, Search, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PortCheckResult } from '../types';

export function isValidPortValue(value: string): boolean {
  if (!value) return false;
  const port = parseInt(value, 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function PortAvailabilityChecker() {
  const [checkPort, setCheckPort] = useState('');
  const [checkResult, setCheckResult] = useState<PortCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const handleCheckPort = async () => {
    if (!isValidPortValue(checkPort)) return;
    const port = parseInt(checkPort, 10);
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch(`/api/modules/ports/check?port=${port}`);
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
      } else {
        setCheckResult(null);
      }
    } catch {
      setCheckResult(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!isValidPortValue(checkPort)) {
      setCheckResult(null);
      return;
    }

    setChecking(true);
    setCheckResult(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const port = parseInt(checkPort, 10);
        const res = await fetch(`/api/modules/ports/check?port=${port}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data: PortCheckResult = await res.json();
          setCheckResult(data);
        } else {
          setCheckResult(null);
        }
      } catch {
        if (!controller.signal.aborted) {
          setCheckResult(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false);
        }
      }
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [checkPort]);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="w-4 h-4 text-primary" />
          Port Availability Checker
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <input
            type="number"
            aria-label="Port number"
            min={1}
            max={65535}
            placeholder="Enter port number (1-65535)"
            value={checkPort}
            onChange={(e) => setCheckPort(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheckPort()}
            className="flex-1 h-10 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleCheckPort}
            disabled={checking || !isValidPortValue(checkPort)}
            className="h-10 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {checking ? <LoaderCircle className="w-4 h-4 animate-spin" /> : 'Check'}
          </button>
        </div>
        {checkPort && !isValidPortValue(checkPort) && (
          <p className="mt-2 text-xs text-destructive">
            Port must be a number between 1 and 65535.
          </p>
        )}
        {checkResult && (
          <div
            className={cn(
              'mt-3 flex items-center gap-2 rounded-lg px-4 py-3 text-sm border',
              checkResult.available
                ? 'bg-success/5 border-success/20 text-success'
                : 'bg-destructive/5 border-destructive/20 text-destructive'
            )}
          >
            {checkResult.available ? (
              <>
                <CheckCircle className="w-4 h-4" /> Port {checkResult.port} is available
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" /> Port {checkResult.port} is in use
                {checkResult.process ? ` by ${checkResult.process}` : ''}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
