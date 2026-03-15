'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Globe,
  LoaderCircle,
  Lock,
  Play,
  RefreshCw,
  Server,
  Settings,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { NginxSnapshot, NginxConfigTest } from '../types';

export default function NginxPage() {
  const [snapshot, setSnapshot] = useState<NginxSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<NginxConfigTest | null>(null);
  const [testing, setTesting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadResult, setReloadResult] = useState<{ success: boolean; output: string } | null>(
    null
  );
  const [expandedVhost, setExpandedVhost] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/nginx', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/modules/nginx/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Config test failed');
      setTestResult(data);
    } catch (err) {
      setTestResult({
        success: false,
        output: err instanceof Error ? err.message : 'Request failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    setReloadResult(null);
    try {
      const res = await fetch('/api/modules/nginx/reload', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reload failed');
      setReloadResult(data);
      if (data.success) load();
    } catch (err) {
      setReloadResult({
        success: false,
        output: err instanceof Error ? err.message : 'Request failed',
      });
    } finally {
      setReloading(false);
    }
  };

  if (loading && !snapshot) {
    return <PageSkeleton statCards={4} />;
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-6">
      {/* Status & Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  snapshot.status.running ? 'bg-success/10' : 'bg-destructive/10'
                )}
              >
                {snapshot.status.running ? (
                  <Play className="w-5 h-5 text-success" />
                ) : (
                  <XCircle className="w-5 h-5 text-destructive" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {snapshot.status.running ? 'Running' : 'Stopped'}
                </p>
                <p className="text-xs text-muted-foreground">PID: {snapshot.status.pid ?? 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">v{snapshot.status.version || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Nginx Version</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot.summary.totalVhosts}</p>
                <p className="text-xs text-muted-foreground">Virtual Hosts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot.summary.sslVhosts}</p>
                <p className="text-xs text-muted-foreground">SSL Enabled</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connections */}
      {snapshot.connections && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="w-4 h-4 text-primary" />
              Live Connections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-2xl font-bold">{snapshot.connections.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-success/5 border border-success/10">
                <p className="text-2xl font-bold">{snapshot.connections.reading}</p>
                <p className="text-xs text-muted-foreground">Reading</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-warning/5 border border-warning/10">
                <p className="text-2xl font-bold">{snapshot.connections.writing}</p>
                <p className="text-xs text-muted-foreground">Writing</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-accent/50">
                <p className="text-2xl font-bold">{snapshot.connections.waiting}</p>
                <p className="text-xs text-muted-foreground">Waiting</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="w-4 h-4 text-primary" />
            Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className="h-9 px-4 bg-secondary text-foreground border border-border rounded-lg text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {testing ? (
                <LoaderCircle className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Test Config
            </button>
            <button
              onClick={handleReload}
              disabled={reloading}
              className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {reloading ? (
                <LoaderCircle className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Reload Nginx
            </button>
            <button
              onClick={load}
              className="h-9 px-4 bg-secondary text-foreground border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {testResult && (
            <div
              className={cn(
                'mt-3 rounded-lg border p-3',
                testResult.success
                  ? 'bg-success/5 border-success/20'
                  : 'bg-destructive/5 border-destructive/20'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-success" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                <span className="text-sm font-medium">
                  {testResult.success ? 'Config test passed' : 'Config test failed'}
                </span>
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-24 overflow-y-auto">
                {testResult.output}
              </pre>
            </div>
          )}

          {reloadResult && (
            <div
              className={cn(
                'mt-3 rounded-lg border p-3',
                reloadResult.success
                  ? 'bg-success/5 border-success/20'
                  : 'bg-destructive/5 border-destructive/20'
              )}
            >
              <div className="flex items-center gap-2">
                {reloadResult.success ? (
                  <CheckCircle className="w-4 h-4 text-success" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                <span className="text-sm font-medium">{reloadResult.output}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Virtual Hosts */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="w-4 h-4 text-primary" />
              Virtual Hosts
            </CardTitle>
            <Badge
              variant={snapshot.source === 'live' ? 'success' : 'warning'}
              className="text-[10px]"
            >
              {snapshot.source}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {snapshot.virtualHosts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No virtual hosts found</p>
          ) : (
            <div className="space-y-3">
              {snapshot.virtualHosts.map((vhost) => (
                <div
                  key={vhost.name}
                  className="rounded-lg border border-border/60 overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedVhost(expandedVhost === vhost.name ? null : vhost.name)
                    }
                    className="w-full p-4 flex items-center justify-between hover:bg-accent/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{vhost.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {vhost.serverNames.join(', ') || 'No server names'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {vhost.sslEnabled && (
                        <Badge variant="warning" className="text-[10px]">
                          <Lock className="w-2.5 h-2.5 mr-1" />
                          SSL
                        </Badge>
                      )}
                      <Badge
                        variant={vhost.enabled ? 'success' : 'secondary'}
                        className="text-[10px]"
                      >
                        {vhost.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </button>
                  {expandedVhost === vhost.name && (
                    <div className="border-t border-border/60 p-4 bg-secondary/30 space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground">Listen:</span>{' '}
                          <span className="font-medium">
                            {vhost.listenPorts.join(', ') || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Root:</span>{' '}
                          <span className="font-mono">{vhost.root || 'N/A'}</span>
                        </div>
                        {vhost.proxyPass && (
                          <div>
                            <span className="text-muted-foreground">Proxy Pass:</span>{' '}
                            <span className="font-mono">{vhost.proxyPass}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">File:</span>{' '}
                          <span className="font-mono">{vhost.filename}</span>
                        </div>
                      </div>
                      {vhost.raw && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground text-[11px]">
                            View config
                          </summary>
                          <pre className="mt-2 p-3 rounded bg-background border border-border text-[11px] font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                            {vhost.raw}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Config Path */}
      {snapshot.status.configPath && (
        <div className="text-xs text-muted-foreground text-center">
          Config:{' '}
          <code className="font-mono bg-secondary px-1.5 py-0.5 rounded">
            {snapshot.status.configPath}
          </code>
        </div>
      )}
    </div>
  );
}
