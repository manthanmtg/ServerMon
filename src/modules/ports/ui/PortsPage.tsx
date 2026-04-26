'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cable,
  CheckCircle,
  Filter,
  LoaderCircle,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PortsSnapshot, PortCheckResult } from '../types';

type ProtocolFilter = 'all' | 'tcp' | 'udp';

const WELL_KNOWN: Record<number, string> = {
  21: 'FTP',
  22: 'SSH',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  143: 'IMAP',
  443: 'HTTPS',
  465: 'SMTPS',
  587: 'Submission',
  993: 'IMAPS',
  995: 'POP3S',
  3000: 'Dev Server',
  3306: 'MySQL',
  5432: 'PostgreSQL',
  5672: 'RabbitMQ',
  6379: 'Redis',
  8080: 'HTTP Alt',
  8443: 'HTTPS Alt',
  8912: 'ServerMon',
  9090: 'Prometheus',
  9200: 'Elasticsearch',
  27017: 'MongoDB',
};

function isValidPortValue(value: string): boolean {
  if (!value) return false;
  const port = parseInt(value, 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function getFilteredListeningPorts(
  listening: PortsSnapshot['listening'],
  protocolFilter: ProtocolFilter,
  search: string
): PortsSnapshot['listening'] {
  const query = search.trim().toLowerCase();

  return listening
    .filter((port) => {
      if (protocolFilter === 'tcp' && !port.protocol.startsWith('tcp')) return false;
      if (protocolFilter === 'udp' && !port.protocol.startsWith('udp')) return false;
      if (!query) return true;

      return (
        port.port.toString().includes(query) ||
        port.process.toLowerCase().includes(query) ||
        port.address.toLowerCase().includes(query) ||
        (port.pid?.toString() || '').includes(query) ||
        (WELL_KNOWN[port.port] || '').toLowerCase().includes(query)
      );
    })
    .sort((left, right) => left.port - right.port);
}

export default function PortsPage() {
  const [snapshot, setSnapshot] = useState<PortsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all');
  const [checkPort, setCheckPort] = useState('');
  const [checkResult, setCheckResult] = useState<PortCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/ports', { cache: 'no-store' });
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
    const interval = window.setInterval(load, 10000);
    return () => window.clearInterval(interval);
  }, [load]);

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

  const filtered = useMemo(
    () => getFilteredListeningPorts(snapshot?.listening ?? [], protocolFilter, search),
    [snapshot?.listening, protocolFilter, search]
  );

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Radio className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot?.summary.totalListening ?? 0}</p>
                <p className="text-xs text-muted-foreground">Listening Ports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot?.summary.tcpCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">TCP Ports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot?.summary.udpCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">UDP Ports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/50 flex items-center justify-center">
                <Cable className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot?.summary.uniqueProcesses ?? 0}</p>
                <p className="text-xs text-muted-foreground">Processes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Port Checker */}
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

      {/* Listening Ports Table */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="w-4 h-4 text-primary" />
              Listening Ports
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search ports..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-9 pr-3 w-48 bg-secondary border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Filter className="w-3 h-3 text-muted-foreground" />
                {(['all', 'tcp', 'udp'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setProtocolFilter(f)}
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium transition-colors',
                      protocolFilter === f
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    )}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
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
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Port</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                    Service
                  </th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                    Protocol
                  </th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                    Address
                  </th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                    Process
                  </th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">PID</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">User</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">State</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted-foreground py-8">
                      No ports found matching filters
                    </td>
                  </tr>
                ) : (
                  filtered.map((p, i) => (
                    <tr
                      key={`${p.protocol}-${p.port}-${p.address}-${i}`}
                      className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono font-semibold">{p.port}</td>
                      <td className="px-4 py-2.5">
                        {WELL_KNOWN[p.port] ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {WELL_KNOWN[p.port]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={p.protocol.startsWith('tcp') ? 'success' : 'warning'}
                          className="text-[10px]"
                        >
                          {p.protocol.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        {p.address || '*'}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{p.process || '-'}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        {p.pid ?? '-'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.user || '-'}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {p.state}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Firewall Rules */}
      {snapshot?.firewall.available && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="w-4 h-4 text-primary" />
                Firewall Rules
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  variant={snapshot.firewall.enabled ? 'success' : 'warning'}
                  className="text-[10px]"
                >
                  {snapshot.firewall.enabled ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {snapshot.firewall.backend.toUpperCase()}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {snapshot.firewall.rules.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">
                No firewall rules configured
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Rule
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Action
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.firewall.rules.map((rule, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono">{rule.port || rule.raw}</td>
                        <td className="px-4 py-2.5">
                          <Badge
                            variant={
                              rule.action.toLowerCase().includes('allow') ||
                              rule.action.toLowerCase().includes('accept')
                                ? 'success'
                                : 'destructive'
                            }
                            className="text-[10px]"
                          >
                            {rule.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {rule.source || 'Any'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
