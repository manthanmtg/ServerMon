'use client';

import { useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EnvVarsSnapshot } from '../types';

const ENV_VARS_WIDGET_TIMEOUT_MS = 8000;

export default function EnvVarsWidget() {
  const [snapshot, setSnapshot] = useState<EnvVarsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, ENV_VARS_WIDGET_TIMEOUT_MS);

    fetch('/api/modules/env-vars', { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Env vars endpoint responded with ${response.status}`);
        }

        return response.json() as Promise<EnvVarsSnapshot>;
      })
      .then((data) => {
        if (active) {
          setSnapshot(data);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (active) {
          setSnapshot(null);
          setLoadError(true);
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (loading) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex items-center justify-center py-12">
          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              EnvVars
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              unavailable
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <p className="font-medium">Environment variable summary is unavailable.</p>
            <p className="mt-1 text-xs text-muted-foreground">Refresh the page to try again.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            EnvVars
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {snapshot?.platform ?? 'unknown'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/50 bg-accent/20 p-3">
            <p className="text-xl font-bold">{snapshot?.persistent.length ?? 0}</p>
            <p className="text-[10px] uppercase text-muted-foreground">Saved</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-accent/20 p-3">
            <p className="text-xl font-bold">{snapshot?.session.length ?? 0}</p>
            <p className="text-[10px] uppercase text-muted-foreground">Env command</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 p-2 text-xs">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{snapshot?.target.userFile ?? 'OS user environment'}</span>
        </div>
      </CardContent>
    </Card>
  );
}
