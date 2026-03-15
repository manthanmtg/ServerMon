'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Globe,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CertificatesSnapshot } from '../types';

function expiryColor(days: number): string {
  if (days < 0) return 'text-destructive';
  if (days <= 7) return 'text-destructive';
  if (days <= 30) return 'text-warning';
  return 'text-success';
}

function expiryBg(days: number): string {
  if (days < 0) return 'bg-destructive/5 border-destructive/20';
  if (days <= 7) return 'bg-destructive/5 border-destructive/20';
  if (days <= 30) return 'bg-warning/5 border-warning/20';
  return 'bg-success/5 border-success/20';
}

export default function CertificatesPage() {
  const [snapshot, setSnapshot] = useState<CertificatesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [renewResult, setRenewResult] = useState<{
    domain: string;
    success: boolean;
    output: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/certificates', { cache: 'no-store' });
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
    const interval = window.setInterval(load, 60000);
    return () => window.clearInterval(interval);
  }, [load]);

  const handleRenew = async (domain: string) => {
    setRenewing(domain);
    setRenewResult(null);
    try {
      const res = await fetch('/api/modules/certificates/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      setRenewResult({ domain, ...data });
      if (data.success) load();
    } catch {
      setRenewResult({ domain, success: false, output: 'Request failed' });
    } finally {
      setRenewing(null);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot.summary.total}</p>
                <p className="text-xs text-muted-foreground">Total Certs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot.summary.valid}</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot.summary.expiringSoon}</p>
                <p className="text-xs text-muted-foreground">Expiring Soon</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot.summary.expired}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Certbot Timer */}
      {snapshot.certbotTimer && (
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Auto-Renewal Timer</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <Badge
                  variant={snapshot.certbotTimer.active ? 'success' : 'warning'}
                  className="text-[10px]"
                >
                  {snapshot.certbotTimer.active ? 'Active' : 'Inactive'}
                </Badge>
                {snapshot.certbotTimer.nextRun && (
                  <span className="text-muted-foreground">
                    Next:{' '}
                    <span className="font-medium text-foreground">
                      {snapshot.certbotTimer.nextRun}
                    </span>
                  </span>
                )}
                {snapshot.certbotTimer.lastRun && (
                  <span className="text-muted-foreground">
                    Last:{' '}
                    <span className="font-medium text-foreground">
                      {snapshot.certbotTimer.lastRun}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Renewal Result */}
      {renewResult && (
        <Card
          className={cn(
            'border',
            renewResult.success
              ? 'border-success/30 bg-success/5'
              : 'border-destructive/30 bg-destructive/5'
          )}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              {renewResult.success ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {renewResult.success ? 'Renewal successful' : 'Renewal failed'} for{' '}
                {renewResult.domain}
              </span>
            </div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
              {renewResult.output}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Certificates List */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="w-4 h-4 text-primary" />
              Certificates
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge
                variant={snapshot.certbotAvailable ? 'success' : 'warning'}
                className="text-[10px]"
              >
                {snapshot.certbotAvailable ? 'Certbot Available' : 'Certbot Not Found'}
              </Badge>
              <Badge
                variant={snapshot.source === 'live' ? 'success' : 'warning'}
                className="text-[10px]"
              >
                {snapshot.source}
              </Badge>
              <button
                onClick={load}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {snapshot.certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No certificates found</p>
          ) : (
            <div className="space-y-3">
              {snapshot.certificates.map((cert) => (
                <div
                  key={cert.name}
                  className={cn('rounded-lg border p-4 space-y-3', expiryBg(cert.daysUntilExpiry))}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">{cert.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          cert.isExpired
                            ? 'destructive'
                            : cert.isExpiringSoon
                              ? 'warning'
                              : 'success'
                        }
                        className="text-[10px]"
                      >
                        {cert.isExpired
                          ? 'Expired'
                          : cert.isExpiringSoon
                            ? 'Expiring Soon'
                            : 'Valid'}
                      </Badge>
                      <span
                        className={cn('text-xs font-semibold', expiryColor(cert.daysUntilExpiry))}
                      >
                        {cert.daysUntilExpiry < 0
                          ? `Expired ${Math.abs(cert.daysUntilExpiry)}d ago`
                          : `${cert.daysUntilExpiry}d remaining`}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Domains:</span>
                      <span className="font-medium">{cert.domains.join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Expires:</span>
                      <span className="font-medium">
                        {new Date(cert.expiryDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {cert.certPath && (
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      {cert.certPath}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRenew(cert.name)}
                      disabled={renewing === cert.name}
                      className="h-7 px-3 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {renewing === cert.name ? (
                        <LoaderCircle className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Renew
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
