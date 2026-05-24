'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Lock,
  Shield,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageSkeleton } from '@/components/ui/skeleton';
import type { SecuritySnapshot } from '../types';
import { SecurityChecksByCategory } from './SecurityChecksByCategory';
import { SecurityScoreOverview } from './SecurityScoreOverview';

export default function SecurityPage() {
  const [snapshot, setSnapshot] = useState<SecuritySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/modules/security', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Unable to load security data (HTTP ${res.status}).`);
      }
      const data = (await res.json()) as SecuritySnapshot;
      setSnapshot(data);
    } catch {
      setError('Unable to load security status. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  const checksByCategory = useMemo(() => {
    const grouped = new Map<string, SecuritySnapshot['checks']>();

    for (const check of snapshot?.checks ?? []) {
      const existing = grouped.get(check.category);
      if (existing) {
        existing.push(check);
      } else {
        grouped.set(check.category, [check]);
      }
    }

    return grouped;
  }, [snapshot?.checks]);

  if (loading && !snapshot) {
    return <PageSkeleton statCards={3} />;
  }

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">Security status unavailable</p>
              <p className="text-sm text-muted-foreground">{error ?? 'Unable to load security status.'}</p>
            </div>
            <Button type="button" variant="destructive" size="sm" onClick={load} className="shrink-0">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SecurityScoreOverview
        score={snapshot.score}
        source={snapshot.source}
        summary={snapshot.summary}
        firewallRulesCount={snapshot.firewall.rulesCount}
      />

      <SecurityChecksByCategory
        checksByCategory={checksByCategory}
        error={error}
        onRefresh={load}
      />

      {/* Fail2Ban */}
      {snapshot.fail2ban.available && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Ban className="w-4 h-4 text-primary" />
                Fail2Ban
              </CardTitle>
              <Badge
                variant={snapshot.fail2ban.running ? 'success' : 'destructive'}
                className="text-[10px]"
              >
                {snapshot.fail2ban.running ? 'Running' : 'Stopped'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {snapshot.fail2ban.jails.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No jails configured</p>
            ) : (
              <div className="space-y-3">
                {snapshot.fail2ban.jails.map((jail) => (
                  <div key={jail.name} className="p-3 rounded-lg border border-border/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{jail.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={jail.currentlyBanned > 0 ? 'warning' : 'secondary'}
                          className="text-[10px]"
                        >
                          {jail.currentlyBanned} banned
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {jail.totalBanned} total
                        </span>
                      </div>
                    </div>
                    {jail.bannedIps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {jail.bannedIps.map((ip) => (
                          <Badge key={ip} variant="destructive" className="text-[10px] font-mono">
                            {ip}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SSH Configuration */}
      {snapshot.ssh && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="w-4 h-4 text-primary" />
              SSH Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {Object.entries({
                'Root Login': snapshot.ssh.permitRootLogin,
                'Password Auth': snapshot.ssh.passwordAuthentication,
                Port: snapshot.ssh.port,
                'Max Auth Tries': snapshot.ssh.maxAuthTries,
                'Pubkey Auth': snapshot.ssh.pubkeyAuthentication,
                'X11 Forwarding': snapshot.ssh.x11Forwarding,
              }).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-2 rounded bg-secondary/50"
                >
                  <span className="text-muted-foreground">{key}</span>
                  <Badge
                    variant={
                      (key === 'Root Login' && value === 'no') ||
                      (key === 'Password Auth' && value === 'no') ||
                      (key === 'Pubkey Auth' && value === 'yes') ||
                      (key === 'X11 Forwarding' && value === 'no')
                        ? 'success'
                        : 'secondary'
                    }
                    className="text-[10px] font-mono"
                  >
                    {value}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Logins */}
      {snapshot.recentLogins.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="w-4 h-4 text-primary" />
              Recent Logins
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                      Status
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                      User
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                      IP Address
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.recentLogins.map((login, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        {login.success ? (
                          <Badge variant="success" className="text-[10px]">
                            Success
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            Failed
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{login.user}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        {login.ip || '-'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{login.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Updates */}
      {snapshot.pendingUpdates.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="w-4 h-4 text-primary" />
              Pending Updates ({snapshot.pendingUpdates.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                      Package
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                      Current
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                      Available
                    </th>
                    <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.pendingUpdates.map((update, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium">{update.package}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        {update.currentVersion || '-'}
                      </td>
                      <td className="px-4 py-2.5 font-mono">{update.newVersion || '-'}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={update.isSecurity ? 'destructive' : 'secondary'}
                          className="text-[10px]"
                        >
                          {update.isSecurity ? 'Security' : 'Regular'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
