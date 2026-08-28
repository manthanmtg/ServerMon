'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, LoaderCircle, Search, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
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
  const [checkError, setCheckError] = useState<string | null>(null);
  const activeCheckRef = useRef<AbortController | null>(null);
  const pendingCheckRef = useRef<number | null>(null);

  const runCheck = useCallback(async (port: number) => {
    activeCheckRef.current?.abort();
    const controller = new AbortController();
    activeCheckRef.current = controller;
    const { signal } = controller;

    setChecking(true);
    setCheckResult(null);
    setCheckError(null);

    try {
      const res = await fetch(`/api/modules/ports/check?port=${port}`, { signal });
      if (res.ok) {
        const data: PortCheckResult = await res.json();
        if (!signal.aborted && activeCheckRef.current === controller) {
          setCheckResult(data);
        }
      } else if (!signal.aborted && activeCheckRef.current === controller) {
        setCheckError('The port check service returned an unexpected response.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (signal.aborted || activeCheckRef.current !== controller) {
        return;
      }
      setCheckError('Unable to check port availability. Please try again.');
    } finally {
      if (!signal.aborted && activeCheckRef.current === controller) {
        setChecking(false);
      }
    }
  }, []);

  const handleCheckPort = () => {
    if (!isValidPortValue(checkPort)) return;
    if (pendingCheckRef.current !== null) {
      window.clearTimeout(pendingCheckRef.current);
      pendingCheckRef.current = null;
    }
    const port = parseInt(checkPort, 10);
    void runCheck(port);
  };

  useEffect(() => {
    activeCheckRef.current?.abort();
    activeCheckRef.current = null;
    setChecking(false);

    if (!isValidPortValue(checkPort)) {
      setCheckResult(null);
      setCheckError(null);
      return;
    }

    setCheckResult(null);
    setCheckError(null);
    const timeoutId = window.setTimeout(() => {
      pendingCheckRef.current = null;
      const port = parseInt(checkPort, 10);
      void runCheck(port);
    }, 400);
    pendingCheckRef.current = timeoutId;

    return () => {
      window.clearTimeout(timeoutId);
      if (pendingCheckRef.current === timeoutId) {
        pendingCheckRef.current = null;
      }
    };
  }, [checkPort, runCheck]);

  useEffect(() => {
    return () => activeCheckRef.current?.abort();
  }, []);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="w-4 h-4 text-primary" />
          Port Availability Checker
        </CardTitle>
      </CardHeader>
      <CardContent>
        <motion.div layout className="space-y-3">
          <motion.div
            className="flex items-center gap-3"
            layout
            initial={{ opacity: 0.95 }}
            animate={{ opacity: 1 }}
          >
            <motion.input
              type="number"
              aria-label="Port number"
              min={1}
              max={65535}
              placeholder="Enter port number (1-65535)"
              value={checkPort}
              onChange={(e) => setCheckPort(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheckPort()}
              whileFocus={{ scale: 1.01 }}
              transition={{ duration: 0.12 }}
              className="flex-1 h-10 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
            <motion.button
              type="button"
              onClick={handleCheckPort}
              disabled={checking || !isValidPortValue(checkPort)}
              whileHover={{ y: -1, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'relative h-10 px-4 rounded-lg text-sm font-medium transition-all disabled:opacity-50',
                'inline-flex items-center justify-center min-w-20 text-primary-foreground',
                'bg-primary hover:bg-primary/90',
                checkPort && isValidPortValue(checkPort)
                  ? 'shadow-sm shadow-primary/20'
                  : 'bg-primary/60'
              )}
            >
              {checking ? <LoaderCircle className="w-4 h-4 animate-spin" /> : 'Check'}
            </motion.button>
          </motion.div>
          {checkPort && !isValidPortValue(checkPort) && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-destructive"
            >
              Port must be a number between 1 and 65535.
            </motion.p>
          )}
          {checkError && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-destructive"
            >
              {checkError}
            </motion.p>
          )}
          <AnimatePresence>
            {checkResult && (
              <motion.div
                key={`${checkResult.port}-${checkResult.available}`}
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.16 }}
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
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </CardContent>
    </Card>
  );
}
