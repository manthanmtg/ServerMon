'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  Info,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  User,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSkeleton } from '@/components/ui/skeleton';
import type { SecuritySnapshot, CheckStatus } from '../types';

function ScoreGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--destructive)';
  return (
    <div className="relative w-28 h-28">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

const statusIcon: Record<CheckStatus, React.ReactNode> = {
  pass: <CheckCircle className="w-4 h-4 text-success" />,
  fail: <XCircle className="w-4 h-4 text-destructive" />,
  warn: <AlertTriangle className="w-4 h-4 text-warning" />,
  info: <Info className="w-4 h-4 text-primary" />,
  skip: <SkipForward className="w-4 h-4 text-muted-foreground" />,
};

const statusLabel: Record<CheckStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  warn: 'Warning',
  info: 'Info',
  skip: 'Skipped',
};

export default function SecurityPage() {
  const [snapshot, setSnapshot] = useState<SecuritySnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/security', { cache: 'no-store' });
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

  if (!snapshot) return null;

  return (
    <div className="space-y-6">
      {/* Score & Summary */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
        <Card className="border-border/60">
          <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3">
            <ScoreGauge score={snapshot.score} />
            <p className="text-sm font-medium">Security Score</p>
            <Badge
              variant={snapshot.source === 'live' ? 'success' : 'warning'}
              className="text-[10px]"
            >
              {snapshot.source}
            </Badge>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-success" />
                <div>
                  <p className="text-2xl font-bold">{snapshot.summary.passed}</p>
                  <p className="text-xs text-muted-foreground">Passed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">{snapshot.summary.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <div>
                  <p className="text-2xl font-bold">{snapshot.summary.warnings}</p>
                  <p className="text-xs text-muted-foreground">Warnings</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Ban className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{snapshot.summary.bannedIps}</p>
                  <p className="text-xs text-muted-foreground">Banned IPs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-warning" />
                <div>
                  <p className="text-2xl font-bold">{snapshot.summary.pendingSecurityUpdates}</p>
                  <p className="text-xs text-muted-foreground">Security Updates</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{snapshot.firewall.rulesCount}</p>
                  <p className="text-xs text-muted-foreground">Firewall Rules</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Security Checks by Category */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Security Checks
            </CardTitle>
            <button
              type="button"
              onClick={load}
              aria-label="Refresh security checks"
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from(checksByCategory.entries()).map(([cat, checks]) => (
            <div key={cat}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {cat}
              </h3>
              <div className="space-y-1.5">
                {checks.map((check) => (
                  <div
                    key={check.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/30 transition-colors"
                  >
                    {statusIcon[check.status]}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{check.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{check.details}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px]">
                        {check.severity}
                      </Badge>
                      <Badge
                        variant={
                          check.status === 'pass'
                            ? 'success'
                            : check.status === 'fail'
                              ? 'destructive'
                              : check.status === 'warn'
                                ? 'warning'
                                : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {statusLabel[check.status]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

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
